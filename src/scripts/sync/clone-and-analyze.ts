
import * as debugLib from 'debug';
import * as path from 'path';
import axios from 'axios';
import { defaultExclusionGlobs } from '../../common';
import { find, getSCMSupportedManifests, gitClone } from '../../lib';
import { getSCMSupportedProjectTypes } from '../../lib/supported-project-types/supported-manifests';
import type {
  RepoMetaData,
  SnykProject,
  SyncTargetsConfig,
  Target,
} from '../../lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';
import { deleteDirectory } from '../../lib/delete-directory';
import { BitbucketCloudSyncClient } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import type { BitbucketAuth } from '../../lib/source-handlers/bitbucket-cloud/sync-client';

const debug = debugLib('snyk:clone-and-analyze');


export async function cloneAndAnalyze(
  integrationType: SupportedIntegrationTypesUpdateProject,
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  config: Omit<SyncTargetsConfig, 'dryRun'>,
  clientType?: 'cloud' | 'server',
  auth?: BitbucketAuth | { sourceUrl: string; token: string },
  target?: Target,
): Promise<{
  import: string[];
  remove: SnykProject[];
  branch?: string;
}> {
  const {
    manifestTypes,
    entitlements = ['openSource'],
    exclusionGlobs = [],
  } = config;
  const manifestFileTypes =
    manifestTypes && manifestTypes.length > 0
      ? manifestTypes
      : getSCMSupportedProjectTypes(entitlements);

  // Bitbucket Cloud/Server logic
  if (
    integrationType === SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD ||
    integrationType === SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER
  ) {
    let files: string[] = [];
    if (clientType === 'cloud') {
      if (!target?.owner || !target?.name) {
        throw new Error('Bitbucket Cloud target must have owner and name properties');
      }
  const client = new BitbucketCloudSyncClient(auth as BitbucketAuth);
  const workspace = target.owner;
  const repoSlug = target.name;
  // Fetch repository metadata to get the true default branch
  const repoInfo = await client.getRepository(workspace, repoSlug);
  const defaultBranch = repoInfo?.mainbranch?.name || repoMetadata.branch || '';
  debug(`[Bitbucket] True default branch for ${workspace}/${repoSlug}: ${defaultBranch}`);
  debug(`[Bitbucket] Calling listFiles with workspace='${workspace}', repoSlug='${repoSlug}', branch='${defaultBranch}'`);
  files = await client.listFiles(workspace, repoSlug, defaultBranch);
      // Optionally propagate the branch for logging/upstream use
      repoMetadata.branch = defaultBranch;
    } else if (clientType === 'server') {
      const projectKey = target?.projectKey;
      const repoSlug = target?.repoSlug;
      const sourceUrl = (auth as { sourceUrl: string }).sourceUrl;
      const token = (auth as { token: string }).token;
      if (!projectKey || !repoSlug || !sourceUrl || !token) {
        throw new Error('Bitbucket Server sync requires projectKey, repoSlug, sourceUrl, and token');
      }
      const apiUrl = `${sourceUrl}/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/files`;
      const headers = { authorization: `Bearer ${token}` };
      try {
        const res = await axios.get(apiUrl, { headers });
        if (res.status === 200 && Array.isArray(res.data.values)) {
          files = res.data.values;
        }
      } catch (err: any) {
        throw new Error(`Failed to list files for Bitbucket Server repo: ${err.message}`);
      }
    } else {
      throw new Error('Unknown Bitbucket client type');
    }
    // Filter files by exclusion globs and manifest types
    const filteredFiles = files.filter((file: string) => {
      if ([...defaultExclusionGlobs, ...exclusionGlobs].some((glob) => file.includes(glob))) {
        return false;
      }
      return manifestFileTypes.some((type) => file.endsWith(type));
    });
    return generateProjectDiffActions(
      filteredFiles,
      snykMonitoredProjects,
      manifestFileTypes,
    );
  }

  // Generic SCM logic
  const { success, repoPath, gitResponse } = await gitClone(
    integrationType,
    repoMetadata,
  );
  debug('Clone response', { success, repoPath, gitResponse });

  if (!success) {
    throw new Error(gitResponse);
  }

  if (!repoPath) {
    throw new Error('No location returned for clones repo to analyze');
  }
  // Sanitize repoPath to prevent path traversal
  const sanitizedRepoPath = path.resolve('/', repoPath);

  // Validate exclusionGlobs to prevent ReDoS
  function isSafeGlob(glob: string): boolean {
    // Only allow globs with safe characters (alphanumeric, *, ?, ., /, -, _)
    // Disallow consecutive * and overly long patterns
    if (!/^[\w\-*?./]+$/.test(glob)) return false;
    if (glob.length > 128) return false;
    if (glob.includes('**')) return false;
    return true;
  }
  const safeExclusionGlobs = [...defaultExclusionGlobs, ...exclusionGlobs].filter(isSafeGlob);

  // Ensure sanitizedRepoPath is inside allowed directory (e.g., /tmp or working dir)
  const allowedBaseDir = path.resolve(process.cwd());
  if (!sanitizedRepoPath.startsWith(allowedBaseDir)) {
    throw new Error('Path traversal detected: repoPath is outside allowed directory');
  }

  const { files } = await find(
    sanitizedRepoPath,
    safeExclusionGlobs,
    // TODO: when possible switch to check entitlements via API automatically for an org
    // right now the product entitlements are not exposed via API so user has to provide which products
    // they are using
    getSCMSupportedManifests(manifestFileTypes, entitlements),
    10,
  );
  const relativeFileNames = files
    .filter((f) => f.startsWith(repoPath))
    .map((f) => path.relative(repoPath, f));
  debug(
    `Detected ${files.length} files in ${repoMetadata.cloneUrl}: ${files.join(
      ',',
    )}`,
  );

  try {
    await deleteDirectory(repoPath);
  } catch (error) {
    debug(`Failed to delete ${repoPath}. Error was ${error}.`);
  }

  const diffActions = generateProjectDiffActions(
    relativeFileNames,
    snykMonitoredProjects,
    manifestFileTypes,
  );
  // Propagate branch info for Bitbucket Cloud
  return {
    ...diffActions,
    branch: repoMetadata.branch,
  };
}
