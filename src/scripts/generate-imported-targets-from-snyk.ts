import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as path from 'path';
import * as pMap from 'p-map';
import * as _ from 'lodash';

import type {
  FilePath,
  SnykProject,
  Target,
} from '../lib/types';
import {
  SupportedIntegrationTypesToListSnykTargets,
} from '../lib/types';
import {
  getAllOrgs,
  getLoggingPath,
  listIntegrations,
  listProjects,
} from '../lib';
import { logImportedTargets } from '../loggers/log-imported-targets';
import { IMPORT_LOG_NAME, targetProps } from '../common';
import { generateTargetId } from '../generate-target-id';

const debug = debugLib('snyk:generate-snyk-imported-targets');

export interface ImportTarget {
  orgId: string;
  integrationId: string;
  target: Target;
  files?: FilePath[];
  exclusionGlobs?: string;
}

export function projectToTarget(
  project: Pick<SnykProject, 'name' | 'branch'>,
): Target {
  const [owner, name] = project.name.split(':')[0].split('/');
  return {
    owner,
    branch: project.branch || undefined, // TODO: make it not optional
    name,
  };
}
export function bitbucketServerProjectToTarget(
  project: Pick<SnykProject, 'name' | 'branch'>,
): Target {
  const [projectKey, repoSlug] = project.name.split(':')[0].split('/');
  return {
    projectKey,
    repoSlug,
  };
}

export function gitlabProjectToImportLogTarget(
  project: Pick<SnykProject, 'name' | 'branch'>,
): Target {
  // Gitlab target is only `id` & branch and the Snyk API does not return the id.
  // However we are already logging `name` which for Gitlab is "owner/repo", branch & id so if we use the same name we can match on it
  const name = project.name.split(':')[0];
  return {
    branch: project.branch || undefined, // TODO: make it not optional
    name,
  };
}

export function imageProjectToTarget(
  project: Pick<SnykProject, 'name'>,
): Target {
  return {
    name: project.name,
  };
}

export const targetGenerators = {
  [SupportedIntegrationTypesToListSnykTargets.GITHUB]: projectToTarget,
  [SupportedIntegrationTypesToListSnykTargets.GITLAB]: gitlabProjectToImportLogTarget,
  [SupportedIntegrationTypesToListSnykTargets.GHE]: projectToTarget,
  [SupportedIntegrationTypesToListSnykTargets.BITBUCKET_CLOUD]: projectToTarget,
  [SupportedIntegrationTypesToListSnykTargets.GCR]: imageProjectToTarget,
  [SupportedIntegrationTypesToListSnykTargets.DOCKER_HUB]: imageProjectToTarget,
  [SupportedIntegrationTypesToListSnykTargets.AZURE_REPOS]: projectToTarget,
  [SupportedIntegrationTypesToListSnykTargets.BITBUCKET_SERVER]: bitbucketServerProjectToTarget,
};

interface SnykOrg {
  id: string;
  slug?: string;
  name?: string;
}

export async function generateSnykImportedTargets(
  id: { groupId?: string; orgId?: string },
  integrationTypes: SupportedIntegrationTypesToListSnykTargets[],
): Promise<{
  targets: ImportTarget[];
  fileName: string;
  failedOrgs: SnykOrg[];
}> {
  const timeLabel = 'Generated imported Snyk targets';
  console.time(timeLabel);
  const { groupId, orgId } = id;
  if (!(groupId || orgId)) {
    throw new Error(
      'Missing required parameters: orgId or groupId must be provided.',
    );
  }
  if (groupId && orgId) {
    throw new Error(
      'Too many parameters: orgId or groupId must be provided, not both.',
    );
  }
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
  });
  const targetsData: ImportTarget[] = [];
  const groupOrgs = groupId
    ? await getAllOrgs(requestManager, groupId)
    : [{ id: orgId! }];
  const failedOrgs: SnykOrg[] = [];
  const projectFilters = integrationTypes.length > 1 ? { limit: 100 } : { origin: integrationTypes[0], limit: 100 };
  await pMap(
    groupOrgs,
    async (org: SnykOrg) => {
      const { id: orgId, name, slug } = org;
      try {
        const [resProjects, resIntegrations] = await Promise.all([
          listProjects(requestManager, orgId, projectFilters),
          listIntegrations(requestManager, orgId),
        ]);
        const { projects } = resProjects;
        const scmTargets = projects
          .filter((p) =>
            integrationTypes.includes(
              p.origin as SupportedIntegrationTypesToListSnykTargets,
            ),
          )
          .map((p) => {
            const target = targetGenerators[
              p.origin as SupportedIntegrationTypesToListSnykTargets
            ](p);
            return {
              target,
              integrationId: resIntegrations[p.origin],
            };
          });

        const uniqueTargets: Set<string> = new Set();
        const orgTargets: Target[] = [];
        if (!scmTargets.length || scmTargets.length === 0) {
          console.warn('No projects in org', orgId);
          return;
        }
        for (const data of scmTargets) {
          const { target, integrationId } = data;
          const targetId = generateTargetId(orgId, integrationId, target);
          if (uniqueTargets.has(targetId)) {
            continue;
          }
          uniqueTargets.add(targetId);
          const importedTarget = {
            target: _.pick(target, ...targetProps),
            integrationId,
            orgId,
          };
          targetsData.push(importedTarget);
          orgTargets.push(target);
        }
        console.log(
          'Extracted',
          uniqueTargets.size,
          'unique targets from',
          scmTargets.length,
          'projects from org',
          orgId,
        );
        await logImportedTargets(
          targetsData,
          null,
          undefined,
          'Target exists in Snyk',
        );
      } catch (e) {
        failedOrgs.push(org);
        console.warn(
          `Failed to process projects for organization ${name && slug ? `${name}(${slug})` : orgId
          }. Continuing.`,
        );
      }
    },
    { concurrency: 15 },
  );
  if (targetsData.length === 0) {
    debug('No targets could be generated. Could Snyk Group have no projects?');
    const message = groupId
      ? `Could Snyk organizations in the group (${groupId}) be empty?`
      : `Could the organization ${orgId} be empty?`;
    console.warn(`No targets could be generated. ${message}`);
  }
  console.timeEnd(timeLabel);
  return {
    targets: targetsData,
    fileName: path.resolve(getLoggingPath(), IMPORT_LOG_NAME),
    failedOrgs,
  };
}
