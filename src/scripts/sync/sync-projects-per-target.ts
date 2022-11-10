import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { getGithubReposDefaultBranch } from '../../lib/source-handlers/github';
import { updateBranch } from '../../lib/project/update-branch';
import type { SnykProject, SnykTarget, Target } from '../../lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../lib/types';
import { targetGenerators } from '../generate-imported-targets-from-snyk';
import { listProjects } from '../../lib';
import pMap = require('p-map');
const debug = debugLib('snyk:sync-projects-per-target');

export function getBranchGenerator(
  origin: SupportedIntegrationTypesUpdateProject,
): (target: Target, host?: string | undefined) => Promise<string> {
  const getDefaultBranchGenerators = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]:
      getGithubReposDefaultBranch,
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

  // update branches
  const { updated, failed } = await bulkUpdateProjectsBranch(
    requestManager,
    orgId,
    projects,
    dryRun,
    host,
  );
  // add target info for logs
  return {
    updated: updated.map((t) => ({ ...t, target })),
    failed: failed.map((t) => ({ ...t, target })),
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
  dryRun = false,
  host?: string,
): Promise<{ updated: ProjectUpdate[]; failed: ProjectUpdateFailure[] }> {
  const updatedProjects: ProjectUpdate[] = [];
  const failedProjects: ProjectUpdateFailure[] = [];

  let defaultBranch: string;
  const origin = projects[0].origin as SupportedIntegrationTypesUpdateProject;
  try {
    const target = targetGenerators[origin](projects[0]);
    debug(`Getting default branch via ${origin} for ${projects[0].name}`);
    defaultBranch = await getBranchGenerator(origin)(target, host);
  } catch (e) {
    debug(e);
    const error = `Getting default branch via ${origin} API failed with error: ${e.message}`;
    console.error(error);
    projects.map((project) => {
      failedProjects.push({
        errorMessage: error,
        projectPublicId: project.id,
        type: 'branch',
        from: project.branch!,
        to: defaultBranch,
        dryRun,
      });
    });
    return { updated: updatedProjects, failed: failedProjects };
  }

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
          defaultBranch,
          orgId,
          dryRun,
        );
        if (updated) {
          updatedProjects.push({
            projectPublicId: project.id,
            type: 'branch',
            from: project.branch!,
            to: defaultBranch,
            dryRun,
          });
          debug(
            `Default branch updated from ${project.branch!} to ${defaultBranch} for ${
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
          to: defaultBranch,
          dryRun,
        });
      }
    },
    { concurrency: 30 },
  );

  return { updated: updatedProjects, failed: failedProjects };
}
