import pMap = require('p-map');
import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import { UPDATED_PROJECTS_LOG_NAME } from '../../common';
import type {
  TargetFilters,
} from '../../lib';
import {
  getLoggingPath,
  listProjects,
  listTargets,
} from '../../lib';
import { getFeatureFlag } from '../../lib/api/feature-flags';
import type {
  SnykProject,
  SnykTarget,
} from '../../lib/types';
import {
  SupportedIntegrationTypesUpdateProject,
} from '../../lib/types';
import { logUpdatedProjects } from '../../loggers/log-updated-project';
import { updateProjectForTarget as updateProjectForTarget } from './sync-projects-per-target';

const debug = debugLib('snyk:sync-org-projects');

export async function updateOrgTargets(
  publicOrgId: string,
  sources: SupportedIntegrationTypesUpdateProject[],
  dryRun = false,
): Promise<{
  fileName: string;
  processedTargets: number;
  meta: {
    projects: {
      branchUpdated: string[];
    };
  };
}> {
  const branchUpdated: string[] = [];
  const logFile = path.resolve(getLoggingPath(), UPDATED_PROJECTS_LOG_NAME);
  const res = {
    fileName: logFile,
    processedTargets: 0,
    meta: {
      projects: {
        branchUpdated,
      },
    },
  };

  // ensure source is enabled for sync
  const allowedSources = sources.filter((source) =>
    Object.values(SupportedIntegrationTypesUpdateProject).includes(source),
  );
  if (!allowedSources.length) {
    console.warn(
      `The organization (${publicOrgId}) does not have any projects that are supported for sync. Currently supported projects are ${Object.values(
        SupportedIntegrationTypesUpdateProject,
      ).join(',')}`,
    );
    return res;
  }

  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
    period: 1000,
    maxRetryCount: 3,
  });

  if (await getFeatureFlag(requestManager, 'customBranch', publicOrgId)) {
    console.warn(
      'Detected custom branches are used in this organization. Skipping syncing organization ${publicOrgId}',
    );
    return res;
  }

  await pMap(
    allowedSources,
    async (source: SupportedIntegrationTypesUpdateProject) => {
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
      const updated = await updateTargets(
        requestManager,
        publicOrgId,
        targets,
        dryRun,
      );
      res.processedTargets += updated.processedTargets;
      res.meta.projects.branchUpdated.push(...updated.meta.projects.branchUpdated);
      debug(`Logging updated targets for source ${source}`);
      // TODO: add a test to ensure a log was created & is the expected format
      await logUpdatedProjects(publicOrgId, branchUpdated, logFile);
    },
    { concurrency: 3 },
  );
  return res;
}

export async function updateTargets(
  requestManager: requestsManager,
  orgId: string,
  targets: SnykTarget[],
  dryRun = false,
): Promise<{
  processedTargets: number;
  meta: {
    projects: {
      branchUpdated: string[];
    };
  };
}> {
  let processedTargets = 0;
  const updated: string[] = [];

  await pMap(
    targets,
    async (target: SnykTarget) => {
      try {
        const filters = { targetId: target.id };
        debug(`Listing projects for target ${target.attributes.displayName}`);
        const { projects } = await listProjects(requestManager, orgId, filters);
        debug(`Syncing projects for target ${target.attributes.displayName}`);
        const { updatedProjects } = await syncAllProjects(requestManager, orgId, projects, dryRun);
        updated.push(...updatedProjects);
        processedTargets += 1;
      } catch (e) {
        debug(e);
        console.warn(`Failed to sync target ${target.attributes.displayName}. ERROR: ${e.message}`)
      }
    },
    { concurrency: 10 },
  );
  return {
    processedTargets,
    // TODO: collect failed targets & log them with reason?
    meta: {
      projects: {
        branchUpdated: updated,
      },
    },
  };
}

async function syncAllProjects(
  requestManager: requestsManager,
  orgId: string,
  projects: SnykProject[],
  dryRun = false): Promise<{ updatedProjects: string[] }> {
  const updatedProjects: string[] = [];
  await pMap(projects, async (project) => {
    const { updated } = await updateProjectForTarget(
      requestManager,
      orgId,
      project,
      dryRun,
    );
    if (updated) {
      updatedProjects.push(project.id);
    }
  });

  return { updatedProjects };
}
