import * as pMap from 'p-map';
import * as debugLib from 'debug';
import * as path from 'path';
import * as fs from 'fs';
import { requestsManager } from 'snyk-request-manager';
import {
  FAILED_UPDATE_PROJECTS_LOG_NAME,
  UPDATED_PROJECTS_LOG_NAME,
} from '../../common';
import { listIntegrations } from '../../lib';
import type { TargetFilters } from '../../lib';
import { isGithubConfigured } from '../../lib';
import { isBitbucketCloudAppConfigured } from '../../lib/source-handlers/bitbucket-cloud-app';
import { isGitHubCloudAppConfigured } from '../../lib/source-handlers/github-cloud-app';
import { getLoggingPath, listTargets } from '../../lib';
import { getFeatureFlag } from '../../lib/api/feature-flags';
import type { SnykTarget, SyncTargetsConfig } from '../../lib/types';
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
    [SupportedIntegrationTypesUpdateProject.GITHUB_CLOUD_APP]:
      isGitHubCloudAppConfigured,
    [SupportedIntegrationTypesUpdateProject.GHE]: isGithubConfigured,
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD]: () => {}, // Add real check if needed
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD_APP]:
      isBitbucketCloudAppConfigured,
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER]: () => {}, // Add real check if needed
  };
  return getDefaultBranchGenerators[origin];
}

export async function updateOrgTargets(
  publicOrgId: string,
  sources: SupportedIntegrationTypesUpdateProject[],
  sourceUrl: string | undefined,
  config: SyncTargetsConfig = {
    dryRun: false,
    entitlements: ['openSource'],
    exclusionGlobs: [],
  },
): Promise<{
  fileName: string;
  failedFileName?: string;
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
    userAgentPrefix: 'snyk-api-import:sync',
    period: 1000,
    maxRetryCount: 3,
  });

  let hasCustomBranchFlag = true;

  try {
    hasCustomBranchFlag = await getFeatureFlag(
      requestManager,
      'customBranch',
      publicOrgId,
    );
  } catch {
    throw new Error(
      `Org ${publicOrgId} was not found or you may not have the correct permissions to access the org`,
    );
  }

  // TODO: move this into sync project per target and skip only whats needed
  if (hasCustomBranchFlag) {
    throw new Error(
      `Detected custom branches feature. Skipping syncing organization ${publicOrgId} because it is not possible to determine which should be the default branch.`,
    );
  }

  await pMap(
    allowedSources,
    async (source: SupportedIntegrationTypesUpdateProject) => {
      isSourceConfigured(source)();
      // Map CLI/source enum to the Snyk API "origin" string values where they differ
      function mapSourceToSnykOrigin(
        s: SupportedIntegrationTypesUpdateProject,
      ): string {
        switch (s) {
          case SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD_APP:
            // Snyk represents Bitbucket Cloud App (Connect App) as 'bitbucket-connect-app'
            return 'bitbucket-connect-app';
          default:
            // For other values the enum string matches the Snyk origin
            return s as string;
        }
      }

      const filters: TargetFilters = {
        limit: 100,
        origin: mapSourceToSnykOrigin(source),
        excludeEmpty: true,
      };
      console.log(`Listing all targets for source ${source}`);
      const { targets } = await listTargets(
        requestManager,
        publicOrgId,
        filters,
      );
      console.log(`Found ${targets.length} targets for source ${source}`);
      console.log(`Resolving integration ID for source ${source}`);
      const integrationsData = await listIntegrations(
        requestManager,
        publicOrgId,
      );
      const integrationId = integrationsData[source];
      console.log(`Syncing targets for source ${source}`);
      const response = await updateTargets(
        requestManager,
        publicOrgId,
        targets,
        integrationId,
        sourceUrl,
        config,
      );
      console.log(`Done syncing targets for source ${source}`);
      res.processedTargets += response.processedTargets;
      res.failedTargets += response.failedTargets;
      res.meta.projects.updated.push(...response.meta.projects.updated);
      res.meta.projects.failed.push(...response.meta.projects.failed);
    },
    { concurrency: 30 },
  );

  const failedLogExists = fs.existsSync(
    `${getLoggingPath()}/${publicOrgId}.${FAILED_UPDATE_PROJECTS_LOG_NAME}`,
  );

  return {
    ...res,
    fileName: path.resolve(
      `${getLoggingPath()}/${publicOrgId}.${UPDATED_PROJECTS_LOG_NAME}`,
    ),
    failedFileName: failedLogExists
      ? path.resolve(
          `${getLoggingPath()}/${publicOrgId}.${FAILED_UPDATE_PROJECTS_LOG_NAME}`,
        )
      : undefined,
  };
}

export async function updateTargets(
  requestManager: requestsManager,
  orgId: string,
  targets: SnykTarget[],
  integrationId: string,
  sourceUrl: string | undefined,
  config: SyncTargetsConfig = {
    dryRun: false,
    entitlements: ['openSource'],
  },
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
  const concurrentTargets = 30;

  await pMap(
    targets,
    async (target: SnykTarget) => {
      try {
        console.log(`Processing target ${target.attributes.displayName}`);
        // TODO: is target reachable via SCM token? If not skip listing projects
        const { updated, failed } = await syncProjectsForTarget(
          requestManager,
          orgId,
          target,
          integrationId,
          sourceUrl,
          config,
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
      } finally {
        console.log(
          `Finished processing target ${target.attributes.displayName}`,
        );
      }
      // TODO: exit early if 100% of batch targets failed.
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
