import pMap = require('p-map');
import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import { UPDATED_PROJECTS_LOG_NAME } from '../../common';
import {
  getLoggingPath,
  listProjects,
  listTargets,
  TargetFilters,
} from '../../lib';
import { getFeatureFlag } from '../../lib/get-feature-flag-for-snyk-org';
import {
  SnykTarget,
  SupportedIntegrationTypesUpdateProject,
} from '../../lib/types';
import { logUpdatedProjects } from '../../loggers/log-updated-project';
import { updateProjectPerTarget } from './sync-projects-per-target';

const debug = debugLib('snyk:sync-org-projects');

export async function updateOrgTargets(
  publicOrgId: string,
  sources: SupportedIntegrationTypesUpdateProject[],
): Promise<{
  fileName: string;
  processedTargets: number;
  meta: {
    projects: {
      branchUpdated: string[];
    };
  };
}> {
  let processedTargets = 0;
  const branchUpdated: string[] = [];
  const logFile = path.resolve(getLoggingPath(), UPDATED_PROJECTS_LOG_NAME);
  const res = {
    fileName: logFile,
    processedTargets,
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
        isPrivate: false,
        origin: source,
        excludeEmpty: true,
      };
      debug(`Listing all targets for source ${source}`)
      const { targets } = await listTargets(
        requestManager,
        publicOrgId,
        filters,
      );
      debug(`Syncing targets for source ${source}`)
      const res = await updateTargets(requestManager, publicOrgId, targets);
      processedTargets += res.processedTargets;
      branchUpdated.push(...res.meta.projects.branchUpdated);
      debug(`Logging updated targets for source ${source}`)
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
): Promise<{
  processedTargets: number;
  meta: {
    projects: {
      branchUpdated: string[];
    };
  };
}> {
  let processedTargets = 0;
  const updatedProjects: string[] = [];

  await pMap(
    targets,
    async (target: SnykTarget) => {
      const filters = { targetId: target.id };
      debug(`Listing projects for target ${target.attributes.displayName}`)
      const { projects } = await listProjects(requestManager, orgId, filters);
      // FIXME: make a new function to avoid nested pMaps? or leave it since it's small amount of code for now
      await pMap(projects, async (project) => {
        debug(`Syncing projects for target ${target.attributes.displayName}`)
        const { updated } = await updateProjectPerTarget(
          requestManager,
          orgId,
          project,
        );
        if (updated) {
          updatedProjects.push(project.id);
        }
      });
      processedTargets += 1;
    },
    { concurrency: 10 },
  );
  return {
    processedTargets,
    meta: {
      projects: {
        branchUpdated: updatedProjects,
      },
    },
  };
}
