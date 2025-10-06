import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { getGithubRepoMetaData } from '../../lib/source-handlers/github';
import { getGitHubCloudAppRepoMetadata } from '../../lib/source-handlers/github-cloud-app';
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
import { getBitbucketCloudAuth } from '../../lib/source-handlers/bitbucket-cloud/get-bitbucket-cloud-auth';
import type {
  BitbucketAuth,
  BitbucketAuthType,
} from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import { importSingleTarget } from './import-target';
const debug = debugLib('snyk:sync-projects-per-target');

// Wrapper function for GitHub Cloud App to match the expected signature
async function getGitHubCloudAppRepoMetaData(
  target: Target,
): Promise<RepoMetaData> {
  if (!target.owner || !target.name) {
    throw new Error(
      'GitHub Cloud App target must have owner and name properties',
    );
  }
  return getGitHubCloudAppRepoMetadata(target.owner, target.name);
}

export function getMetaDataGenerator(
  origin: SupportedIntegrationTypesUpdateProject,
): (target: Target, host?: string | undefined) => Promise<RepoMetaData> {
  const getDefaultBranchGenerators: Record<
    SupportedIntegrationTypesUpdateProject,
    (target: Target, host?: string | undefined) => Promise<RepoMetaData>
  > = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]: getGithubRepoMetaData,
    [SupportedIntegrationTypesUpdateProject.GITHUB_CLOUD_APP]:
      getGitHubCloudAppRepoMetaData,
    [SupportedIntegrationTypesUpdateProject.GHE]: getGithubRepoMetaData,
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD]: async (
      target: Target,
    ) =>
      Promise.resolve({
        branch: typeof target.branch === 'string' ? target.branch : '',
        cloneUrl: '',
        sshUrl: '',
        archived: false,
      }),
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER]: async (
      target: Target,
    ) =>
      Promise.resolve({
        branch: typeof target.branch === 'string' ? target.branch : '',
        cloneUrl: '',
        sshUrl: '',
        archived: false,
      }),
  };
  return getDefaultBranchGenerators[origin];
}

export function getTargetConverter(
  origin: SupportedIntegrationTypesUpdateProject,
): (target: SnykTarget) => Target {
  const getTargetConverter: Record<
    SupportedIntegrationTypesUpdateProject,
    (target: SnykTarget) => Target
  > = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]: snykTargetConverter,
    [SupportedIntegrationTypesUpdateProject.GITHUB_CLOUD_APP]:
      snykTargetConverter,
    [SupportedIntegrationTypesUpdateProject.GHE]: snykTargetConverter,
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD]:
      snykTargetConverter,
    [SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER]:
      snykTargetConverter,
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
  const origin = target.attributes
    .origin as SupportedIntegrationTypesUpdateProject;
  const targetData = getTargetConverter(origin)(target);

  // Bitbucket Cloud/Server support
  let deactivate: SnykProject[] = [];
  let createProjects: string[] = [];
  // removed unused bitbucketAuth variable
  try {
    if (origin === SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD) {
      // Use unified Bitbucket Cloud auth logic
      const rawAuth = getBitbucketCloudAuth();
      // Convert BitbucketCloudAuthMethod to BitbucketAuth for sync client
      let bitbucketAuth: BitbucketAuth;
      if (rawAuth.type === 'user') {
        bitbucketAuth = {
          type: 'user',
          username: rawAuth.username,
          appPassword: rawAuth.password,
        };
      } else if (rawAuth.type === 'api' || rawAuth.type === 'oauth') {
        bitbucketAuth = {
          type: rawAuth.type as BitbucketAuthType,
          token: rawAuth.token,
        };
      } else {
        throw new Error('Unsupported Bitbucket Cloud auth type');
      }
      targetMeta = {
        branch: '', // Let cloneAndAnalyze determine the correct branch
        cloneUrl: '',
        sshUrl: '',
        archived: false,
      };
      const res = await cloneAndAnalyze(
        origin,
        targetMeta,
        projects,
        {
          exclusionGlobs: config.exclusionGlobs,
          entitlements: config.entitlements,
          manifestTypes: config.manifestTypes,
        },
        'cloud',
        bitbucketAuth,
        targetData,
      );
      debug(
        `[Bitbucket Cloud] Analysis finished for branch: ${res.branch}`,
        JSON.stringify({
          branch: res.branch,
          remove: res.remove.length,
          import: res.import.length,
        }),
      );
      // Propagate branch from analysis result
      if (res.branch) {
        targetMeta.branch = res.branch;
      }
  // Only deactivate projects whose branch does not match the detected default branch
  const detectedBranch = targetMeta.branch;
  deactivate = res.remove.filter((p) => p.branch !== detectedBranch);
      createProjects = res.import;
    } else if (
      origin === SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER
    ) {
      // TODO: Replace with actual Data Center auth
      const sourceUrl = process.env.BITBUCKET_SERVER_URL;
      const token = process.env.BITBUCKET_SERVER_TOKEN;
      if (!sourceUrl || !token) {
        throw new Error(
          'BITBUCKET_SERVER_URL and BITBUCKET_SERVER_TOKEN must be set for Bitbucket Server sync',
        );
      }
      const datacenterAuth = { sourceUrl, token };
      targetMeta = {
        branch: '', // Let cloneAndAnalyze determine the correct branch
        cloneUrl: '',
        sshUrl: '',
        archived: false,
      };
      const res = await cloneAndAnalyze(
        origin,
        targetMeta,
        projects,
        {
          exclusionGlobs: config.exclusionGlobs,
          entitlements: config.entitlements,
          manifestTypes: config.manifestTypes,
        },
        'server',
        datacenterAuth,
        targetData,
      );
      debug(
        'Bitbucket Data Center analysis finished',
        JSON.stringify({
          remove: res.remove.length,
          import: res.import.length,
        }),
      );
      deactivate = res.remove;
      createProjects = res.import;
    } else {
      targetMeta = await getMetaDataGenerator(origin)(targetData, host);
      if (targetMeta!.archived) {
        deactivate = [...projects];
      } else {
        const res = await cloneAndAnalyze(origin, targetMeta!, projects, {
          exclusionGlobs: config.exclusionGlobs,
          entitlements: config.entitlements,
          manifestTypes: config.manifestTypes,
        });
        debug(
          'Analysis finished',
          JSON.stringify({
            remove: res.remove.length,
            import: res.import.length,
          }),
        );
        deactivate = res.remove;
        createProjects = res.import;
      }
    }
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
            `[Branch Update] Project: ${project.name} (ID: ${project.id}) - Branch changed from '${project.branch!}' to '${branch}' for integration '${project.origin}'`,
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
