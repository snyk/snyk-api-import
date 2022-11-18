import pMap = require('p-map');
import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import {
  FAILED_UPDATE_PROJECTS_LOG_NAME,
  UPDATED_PROJECTS_LOG_NAME,
} from '../../common';
import type { TargetFilters } from '../../lib';
import { isGithubConfigured } from '../../lib';
import { getLoggingPath, listTargets } from '../../lib';
import { getFeatureFlag } from '../../lib/api/feature-flags';
import type { SnykTarget } from '../../lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../lib/types';
import { logUpdatedProjects } from '../../loggers/log-updated-project';
import type { ProjectUpdateFailure } from './sync-projects-per-target';
import { syncProjectsForTarget } from './sync-projects-per-target';
import type { ProjectUpdate } from './sync-projects-per-target';
import { logFailedSync } from '../../loggers/log-failed-sync';
import { logFailedToUpdateProjects } from '../../loggers/log-failed-to-update-projects';

const debug = debugLib('snyk:sync-org-projects');

export function isSourceConfigured(
  origin: SupportedIntegrationTypesUpdateProject,
): () => void {
  const getDefaultBranchGenerators = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]: isGithubConfigured,
    [SupportedIntegrationTypesUpdateProject.GHE]: isGithubConfigured,
  };
  return getDefaultBranchGenerators[origin];
}

export async function updateOrgTargets(
  publicOrgId: string,
  sources: SupportedIntegrationTypesUpdateProject[],
  dryRun = false,
  sourceUrl?: string,
): Promise<{
  fileName: string;
  failedFileName: string;
  processedTargets: number;
  failedTargets: number;
  meta: {
    projects: {
      updated: ProjectUpdate[];
      failed: ProjectUpdateFailure[];
    };
  };
}> {
  const res: {
    failedTargets: number;
    processedTargets: number;
    meta: {
      projects: {
        updated: ProjectUpdate[];
        failed: ProjectUpdateFailure[];
      };
    };
  } = {
    failedTargets: 0,
    processedTargets: 0,
    meta: {
      projects: {
        updated: [],
        failed: [],
      },
    },
  };

  // ensure source is enabled for sync
  const allowedSources = sources.filter((source) =>
    Object.values(SupportedIntegrationTypesUpdateProject).includes(source),
  );
  if (!allowedSources.length) {
    throw new Error(
      `Nothing to sync, stopping. Sync command currently only supports the following sources: ${Object.values(
        SupportedIntegrationTypesUpdateProject,
      ).join(',')}`,
    );
  }

  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
    period: 1000,
    maxRetryCount: 3,
  });

  await pMap(
    allowedSources,
    async (source: SupportedIntegrationTypesUpdateProject) => {
      isSourceConfigured(source)();
      const filters: TargetFilters = {
        limit: 100,
        origin: source,
        excludeEmpty: true,
      };
      debug(`Listing all targets for source ${source}`);
      const { targets } = await listTargets(
        requestManager,
        publicOrgId,
        filters,
      );
      debug(`Syncing targets for source ${source}`);
      const response = await updateTargets(
        requestManager,
        publicOrgId,
        targets,
        dryRun,
        sourceUrl,
      );
      res.processedTargets += response.processedTargets;
      res.failedTargets += response.failedTargets;
      res.meta.projects.updated.push(...response.meta.projects.updated);
      res.meta.projects.failed.push(...response.meta.projects.failed);
    },
    { concurrency: 3 },
  );

  let logFile = UPDATED_PROJECTS_LOG_NAME;
  try {
    logFile = path.resolve(getLoggingPath(), UPDATED_PROJECTS_LOG_NAME);
  } catch (e) {
    console.warn(e.message);
  }
  let failedLogFile = FAILED_UPDATE_PROJECTS_LOG_NAME;
  try {
    failedLogFile = path.resolve(
      getLoggingPath(),
      FAILED_UPDATE_PROJECTS_LOG_NAME,
    );
  } catch (e) {
    console.warn(e.message);
  }
  return { ...res, fileName: logFile, failedFileName: failedLogFile };
}

export async function updateTargets(
  requestManager: requestsManager,
  orgId: string,
  targets: SnykTarget[],
  dryRun = false,
  sourceUrl?: string,
): Promise<{
  failedTargets: number;
  processedTargets: number;
  meta: {
    projects: {
      updated: ProjectUpdate[];
      failed: ProjectUpdateFailure[];
    };
  };
}> {
  let processedTargets = 0;
  let failedTargets = 0;
  const updatedProjects: ProjectUpdate[] = [];
  const failedProjects: ProjectUpdateFailure[] = [];

  const loggingPath = getLoggingPath();
  const concurrentTargets = 50;

  await pMap(
    targets,
    async (target: SnykTarget) => {
      try {
        // TODO: is target reachable via SCM token? If not skip listing projects
        const { updated, failed } = await syncProjectsForTarget(
          requestManager,
          orgId,
          target,
          dryRun,
          sourceUrl,
        );
        updatedProjects.push(...updated);
        failedProjects.push(...failed);
        processedTargets += 1;

        if (updated.length) {
          await logUpdatedProjects(orgId, updated);
        }
        if (failed.length) {
          await logFailedToUpdateProjects(orgId, failed);
        }
      } catch (e) {
        failedTargets += 1;
        debug(e);
        const errorMessage: string = e.message;
        console.warn(
          `Failed to sync target ${target.attributes.displayName}. ERROR: ${errorMessage}`,
        );
        await logFailedSync(orgId, target, errorMessage, loggingPath);
      }

      if (
        updatedProjects.length == 0 &&
        processedTargets == concurrentTargets
      ) {
        console.error(
          `Every target in this batch failed to update projects, stopping as this is unexpected! Please check if everything is configured ok and review the logs located at ${loggingPath}`,
        );
        // die immediately
        process.exit(1);
      }
    },
    { concurrency: concurrentTargets },
  );
  return {
    processedTargets,
    // TODO: collect failed targets & log them with reason?
    failedTargets,
    meta: {
      projects: {
        updated: updatedProjects,
        failed: failedProjects,
      },
    },
  };
}
