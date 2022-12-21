import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { getGithubRepoMetaData } from '../../lib/source-handlers/github';
import { updateBranch } from '../../lib/project/update-branch';
import type {
  SnykProject,
  SnykTarget,
  Target,
  RepoMetaData,
  SyncTargetsConfig,
} from '../../lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../lib/types';
import { targetGenerators } from '../generate-imported-targets-from-snyk';
import { deactivateProject, listProjects } from '../../lib';
import pMap = require('p-map');
import { cloneAndAnalyze } from './clone-and-analyze';
const debug = debugLib('snyk:sync-projects-per-target');

export enum ProjectUpdateType {
  BRANCH = 'branch',
  DEACTIVATE = 'deactivate',
}
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
  host: string | undefined,
  config: SyncTargetsConfig = {
    dryRun: false,
    entitlements: ['openSource'],
  },
): Promise<{ updated: ProjectUpdate[]; failed: ProjectUpdateFailure[] }> {
  const updated = new Set<ProjectUpdate>();
  const failed = new Set<ProjectUpdateFailure>();

  debug(`Listing projects for target ${target.attributes.displayName}`);
  const { projects } = await listProjects(requestManager, orgId, {
    targetId: target.id,
    limit: 100,
  });

  // TODO: if target is empty, try to import it and stop here
  if (projects.length < 1) {
    return {
      updated: Array.from(updated),
      failed: Array.from(failed),
    };
  }
  debug(`Syncing projects for target ${target.attributes.displayName}`);
  let targetMeta: RepoMetaData;
  const origin = projects[0].origin as SupportedIntegrationTypesUpdateProject;

  try {
    const targetData = targetGenerators[origin](projects[0]);
    targetMeta = await getMetaDataGenerator(origin)(targetData, host);
  } catch (e) {
    debug(e);
    const error = `Getting default branch via ${origin} API failed with error: ${e.message}`;
    projects.map((project) => {
      failed.add({
        errorMessage: error,
        projectPublicId: project.id,
        type: ProjectUpdateType.BRANCH,
        from: project.branch!,
        to: targetMeta.branch,
        dryRun: config.dryRun,
        target,
      });
    });
  }

  const deactivate = [];
  try {
    const res = await cloneAndAnalyze(origin, targetMeta!, projects, {
      exclusionGlobs: config.exclusionGlobs,
      entitlements: config.entitlements,
      manifestTypes: config.manifestTypes,
    });
    debug(
      'Analysis finished',
      JSON.stringify({ deactivate: res.deactivate.length }),
    );
    deactivate.push(...res.deactivate);
  } catch (e) {
    debug(e);
    const error = `Cloning and analysing the repo to deactivate projects failed with error: ${e.message}`;
    projects.map((project) => {
      failed.add({
        errorMessage: error,
        projectPublicId: project.id,
        from: 'active',
        to: 'deactivated',
        type: ProjectUpdateType.DEACTIVATE,
        dryRun: config.dryRun,
        target,
      });
    });
  }

  // remove any projects that are to be deactivated from other actions
  const branchUpdateProjects = [];
  const deactivateIds = deactivate.map((p) => p.id);
  for (const p of projects.filter((p) => p.status !== 'inactive')) {
    if (!deactivateIds.includes(p.id)) {
      branchUpdateProjects.push(p);
    }
  }

  const actions = [
    bulkUpdateProjectsBranch(
      requestManager,
      orgId,
      branchUpdateProjects,
      targetMeta!.branch,
      config.dryRun,
    ),
    bulkDeactivateProjects(requestManager, orgId, deactivate, config.dryRun),
  ];

  const [branchUpdate, deactivatedProjects] = await Promise.all(actions);

  branchUpdate.updated
    .map((t) => ({ ...t, target }))
    .forEach((i) => updated.add(i));
  branchUpdate.failed
    .map((t) => ({ ...t, target }))
    .forEach((i) => failed.add(i));

  deactivatedProjects.updated
    .map((t) => ({ ...t, target }))
    .forEach((i) => updated.add(i));
  deactivatedProjects.failed
    .map((t) => ({ ...t, target }))
    .forEach((i) => failed.add(i));
  // TODO: add target info for logs
  return {
    updated: Array.from(updated),
    failed: Array.from(failed),
  };
}

export interface ProjectUpdate {
  projectPublicId: string;
  type: ProjectUpdateType;
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
            type: ProjectUpdateType.BRANCH,
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
          type: ProjectUpdateType.BRANCH,
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

export async function bulkDeactivateProjects(
  requestManager: requestsManager,
  orgId: string,
  projects: SnykProject[] = [],
  dryRun = false,
): Promise<{ updated: ProjectUpdate[]; failed: ProjectUpdateFailure[] }> {
  const updated: ProjectUpdate[] = [];
  const failed: ProjectUpdateFailure[] = [];
  if (!projects.length) {
    return { updated, failed };
  }
  debug(`De-activating projects: ${projects.map((p) => p.id).join(',')}`);
  await pMap(
    projects,
    async (project: SnykProject) => {
      if (!dryRun) {
        try {
          await deactivateProject(requestManager, orgId, project.id);

          updated.push({
            projectPublicId: project.id,
            type: ProjectUpdateType.DEACTIVATE,
            from: 'active',
            to: 'deactivated',
            dryRun,
          });
        } catch (e) {
          failed.push({
            projectPublicId: project.id,
            type: ProjectUpdateType.DEACTIVATE,
            from: 'active',
            to: 'deactivated',
            dryRun,
            errorMessage: `Could not deactivate project: ${e.message}`,
          });
        }
      } else {
        debug('Skipping de-activating project in dryRun mode');

        updated.push(
          ...projects.map((p) => ({
            projectPublicId: p.id,
            type: ProjectUpdateType.DEACTIVATE,
            from: 'active',
            to: 'deactivated',
            dryRun,
          })),
        );
      }
    },
    { concurrency: 50 },
  );

  return { updated, failed };
}
