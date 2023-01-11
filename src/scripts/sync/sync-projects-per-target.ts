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
import { ProjectUpdateType } from '../../lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../lib/types';
import { deactivateProject, listProjects } from '../../lib';
import pMap = require('p-map');
import { cloneAndAnalyze } from './clone-and-analyze';
import { importSingleTarget } from './import-target';
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

export function getTargetConverter(
  origin: SupportedIntegrationTypesUpdateProject,
): (target: SnykTarget) => Target {
  const getTargetConverter = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]: snykTargetConverter,
    [SupportedIntegrationTypesUpdateProject.GHE]: snykTargetConverter,
  };
  return getTargetConverter[origin];
}

export async function syncProjectsForTarget(
  requestManager: requestsManager,
  orgId: string,
  target: SnykTarget,
  integrationId: string,
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

  debug(`Syncing projects for target ${target.attributes.displayName}`);
  let targetMeta: RepoMetaData;
  let isDeleted = false;
  const origin = target.attributes
    .origin as SupportedIntegrationTypesUpdateProject;
  const targetData = getTargetConverter(origin)(target);

  try {
    targetMeta = await getMetaDataGenerator(origin)(targetData, host);
  } catch (e) {
    //TODO: if repo is deleted, deactivate all projects
    debug(`Failed to get metadata ${JSON.stringify(targetData)}: ` + e);
    if (e.status === 404) {
      // TODO: when else could you get a 404? Manually check
      isDeleted = true;
    } else {
      const error = `Getting metadata from ${origin} API failed with error: ${e.message}`;
      projects.map((project) => {
        failed.add({
          errorMessage: error,
          projectPublicId: project.id,
          type: ProjectUpdateType.BRANCH,
          from: project.branch!,
          to: 'unknown',
          dryRun: config.dryRun,
          target,
        });
      });
      return {
        updated: Array.from(updated).map((t) => ({ ...t, target })),
        failed: Array.from(failed).map((t) => ({ ...t, target })),
      };
    }
  }

  if (isDeleted || targetMeta!.archived) {
    const res = await bulkDeactivateProjects(
      requestManager,
      orgId,
      projects,
      config.dryRun,
    );

    res.updated.map((t) => ({ ...t, target })).forEach((i) => updated.add(i));
    res.failed.map((t) => ({ ...t, target })).forEach((i) => failed.add(i));

    return {
      updated: Array.from(updated).map((t) => ({ ...t, target })),
      failed: Array.from(failed).map((t) => ({ ...t, target })),
    };
  }

  const deactivate = [];
  const createProjects = [];

  if (targetMeta!.archived) {
    deactivate.push(...projects);
  } else {
    try {
      const res = await cloneAndAnalyze(origin, targetMeta!, projects, {
        exclusionGlobs: config.exclusionGlobs,
        entitlements: config.entitlements,
        manifestTypes: config.manifestTypes,
      });
      debug(
        'Analysis finished',
        JSON.stringify({
          deactivate: res.deactivate.length,
          import: res.import.length,
        }),
      );
      deactivate.push(...res.deactivate);
      createProjects.push(...res.import);
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
    bulkImportTargetFiles(
      requestManager,
      orgId,
      createProjects,
      integrationId,
      { ...targetData, branch: targetMeta!.branch },
      config.dryRun,
    ),
  ];

  const [branchUpdate, deactivatedProjects, newProjects] = await Promise.all(
    actions,
  );

  [
    ...branchUpdate.updated,
    ...deactivatedProjects.updated,
    ...newProjects.updated,
  ]
    .map((t) => ({ ...t, target }))
    .forEach((i) => updated.add(i));
  [...branchUpdate.failed, ...deactivatedProjects.failed, ...newProjects.failed]
    .map((t) => ({ ...t, target }))
    .forEach((i) => failed.add(i));

  // TODO: add failed target info for logs
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

export async function bulkImportTargetFiles(
  requestManager: requestsManager,
  orgId: string,
  files: string[] = [],
  integrationId: string,
  target: Target,
  dryRun = false,
  concurrentFilesImport = 30,
): Promise<{ updated: ProjectUpdate[]; failed: ProjectUpdateFailure[] }> {
  const updated: ProjectUpdate[] = [];
  const failed: ProjectUpdateFailure[] = [];

  if (!files.length) {
    return { updated, failed };
  }
  debug(`Importing ${files.length} files`);

  if (!dryRun) {
    for (
      let index = 0;
      index < files.length;
      index = index + concurrentFilesImport
    ) {
      const batch = files.slice(index, index + concurrentFilesImport);

      const { projects, failed: failedProjects } = await importSingleTarget(
        requestManager,
        orgId,
        integrationId,
        target,
        batch,
      );
      projects.map((p) => {
        const projectId = p.projectUrl?.split('/').slice(-1)[0];
        updated.push({
          projectPublicId: projectId,
          type: ProjectUpdateType.IMPORT,
          from: p.targetFile ?? '', // TODO: is there something more intuitive here?
          to: p.projectUrl,
          dryRun,
        });
      });
      failedProjects.map((f) => {
        failed.push({
          projectPublicId: '',
          type: ProjectUpdateType.IMPORT,
          from: f.targetFile ?? '', // TODO: is there something more intuitive here?
          to: f.projectUrl,
          dryRun,
          errorMessage:
            f.userMessage ?? 'Failed to import project via Snyk Import API',
        });
      });
    }
    return { updated, failed };
  } else {
    files.map((f) =>
      updated.push({
        projectPublicId: '',
        type: ProjectUpdateType.IMPORT,
        from: f,
        to: `https://app.snyk.io/org/example-org-name/project/example-project-id-uuid`,
        dryRun,
      }),
    );

    return { updated, failed: [] };
  }
}

export function snykTargetConverter(target: SnykTarget): Target {
  const [owner, name] = target.attributes.displayName.split('/');
  return {
    owner,
    name: name,
  };
}
