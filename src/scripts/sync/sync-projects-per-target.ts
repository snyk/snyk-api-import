import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { getGithubRepoMetaData } from '../../lib/source-handlers/github';
import { updateBranch } from '../../lib/project/update-branch';
import type {
  SnykProject,
  SnykTarget,
  Target,
  RepoMetaData,
} from '../../lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../lib/types';
import { targetGenerators } from '../generate-imported-targets-from-snyk';
import { listProjects } from '../../lib';
import pMap = require('p-map');
const debug = debugLib('snyk:sync-projects-per-target');

export function getMetaDataGenerator(
  origin: SupportedIntegrationTypesUpdateProject,
): (target: Target, host?: string | undefined) => Promise<RepoMetaData> {
  const getDefaultBranchGenerators = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]: getGithubRepoMetaData,
    [SupportedIntegrationTypesUpdateProject.GHE]: getGithubRepoMetaData,
  };
  return getDefaultBranchGenerators[origin];
}

export async function syncProjectsForTarget(
  requestManager: requestsManager,
  orgId: string,
  target: SnykTarget,
  dryRun = false,
  host?: string,
): Promise<{ updated: ProjectUpdate[]; failed: ProjectUpdateFailure[] }> {
  const failed: ProjectUpdateFailure[] = [];
  const updated: ProjectUpdate[] = [];
  debug(`Listing projects for target ${target.attributes.displayName}`);
  const { projects } = await listProjects(requestManager, orgId, {
    targetId: target.id,
    limit: 100,
  });
  if (projects.length < 1) {
    throw new Error(
      `No projects returned to process for target: ${target.attributes.displayName} orgId: ${orgId}`,
    );
  }
  debug(`Syncing projects for target ${target.attributes.displayName}`);
  let targetMeta: RepoMetaData;
  try {
    const origin = projects[0].origin as SupportedIntegrationTypesUpdateProject;
    const targetData = targetGenerators[origin](projects[0]);
    debug(`Getting default branch via ${origin} for ${projects[0].name}`);
    targetMeta = await getMetaDataGenerator(origin)(targetData, host);
  } catch (e) {
    debug(e);
    const error = `Getting default branch via ${origin} API failed with error: ${e.message}`;
    console.error(error);
    projects.map((project) => {
      failed.push({
        errorMessage: error,
        projectPublicId: project.id,
        type: 'branch',
        from: project.branch!,
        to: targetMeta.branch,
        dryRun,
        target,
      });
    });
  }

  // update branches
  const res = await bulkUpdateProjectsBranch(
    requestManager,
    orgId,
    projects,
    targetMeta!.branch,
    dryRun,
  );
  updated.push(...res.updated.map((t) => ({ ...t, target })));
  failed.push(...res.failed.map((t) => ({ ...t, target })));
  // add target info for logs
  return {
    updated,
    failed,
  };
}

export interface ProjectUpdate {
  projectPublicId: string;
  type: 'branch';
  from: string;
  to: string;
  dryRun: boolean;
  target?: SnykTarget;
}

export interface ProjectUpdateFailure extends ProjectUpdate {
  errorMessage: string;
}

export async function bulkUpdateProjectsBranch(
  requestManager: requestsManager,
  orgId: string,
  projects: SnykProject[],
  branch: string,
  dryRun = false,
): Promise<{ updated: ProjectUpdate[]; failed: ProjectUpdateFailure[] }> {
  const updatedProjects: ProjectUpdate[] = [];
  const failedProjects: ProjectUpdateFailure[] = [];
  await pMap(
    projects,
    async (project: SnykProject) => {
      try {
        const { updated } = await updateBranch(
          requestManager,
          {
            branch: project.branch!,
            projectPublicId: project.id,
          },
          branch,
          orgId,
          dryRun,
        );
        if (updated) {
          updatedProjects.push({
            projectPublicId: project.id,
            type: 'branch',
            from: project.branch!,
            to: branch,
            dryRun,
          });
          debug(
            `Default branch updated from ${project.branch!} to ${branch} for ${
              project.id
            }`,
          );
        }
      } catch (e) {
        failedProjects.push({
          errorMessage: e.message,
          projectPublicId: project.id,
          type: 'branch',
          from: project.branch!,
          to: branch,
          dryRun,
        });
      }
    },
    { concurrency: 50 },
  );

  return { updated: updatedProjects, failed: failedProjects };
}
