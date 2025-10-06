
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
  // Validate exclusionGlobs to prevent ReDoS
  function isSafeGlob(glob: string): boolean {
    // Only allow globs with safe characters (alphanumeric, *, ?, ., /, -, _)
    // Disallow consecutive * and overly long patterns
    if (!/^[\w\-*?./]+$/.test(glob)) return false;
    if (glob.length > 128) return false;
    if (glob.includes('**')) return false;
    return true;
  }
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
  if (integrationType === SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD || integrationType === SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER) {
    let files: string[] = [];
    if (clientType === 'cloud') {
      if (!target?.owner || !target?.name) {
        throw new Error('Bitbucket Cloud target must have owner and name properties');
      }
      const client = new BitbucketCloudSyncClient(auth as BitbucketAuth);
      const workspace = target.owner;
      const repoSlug = target.name;
      // Fetch repository metadata to get the true default branch
      let repoInfo;
      try {
        repoInfo = await client.getRepository(workspace, repoSlug);
      } catch (err: any) {
        // Authorization or API error: hard fail, do not proceed
        const msg = err?.response?.status === 401 || err?.response?.status === 403
          ? `[Bitbucket] Authorization failed for ${workspace}/${repoSlug}: ${err.message}`
          : `[Bitbucket] Failed to fetch repository info for ${workspace}/${repoSlug}: ${err.message}`;
        console.error(msg);
        throw new Error(msg);
      }
      let defaultBranch = '';
      if (repoInfo?.mainbranch?.name) {
        defaultBranch = repoInfo.mainbranch.name;
      } else {
        const msg = `[Bitbucket] No main branch found for ${workspace}/${repoSlug}.`;
        console.error(msg);
        throw new Error(`Could not determine default branch for Bitbucket repo: ${workspace}/${repoSlug}`);
      }
      debug(`[Bitbucket] True default branch for ${workspace}/${repoSlug}: ${defaultBranch}`);
      debug(`[Bitbucket] Calling listFiles with workspace='${workspace}', repoSlug='${repoSlug}', branch='${defaultBranch}'`);
      try {
        files = await client.listFiles(workspace, repoSlug, defaultBranch);
      } catch (err: any) {
        // Authorization or API error: hard fail, do not proceed
        const msg = err?.response?.status === 401 || err?.response?.status === 403
          ? `[Bitbucket] Authorization failed when listing files for ${workspace}/${repoSlug}: ${err.message}`
          : `[Bitbucket] Failed to list files for ${workspace}/${repoSlug}: ${err.message}`;
        console.error(msg);
        throw new Error(msg);
      }
      console.log('[cloneAndAnalyze] Files returned from Bitbucket Cloud:', files);
      // Optionally propagate the branch for logging/upstream use
      repoMetadata.branch = defaultBranch;
      // Bitbucket Cloud normalization and filtering
      const normalizedFiles = files.map((file: string) => `${workspace}/${repoSlug}:${file}`);
      console.log('[cloneAndAnalyze] Normalized Bitbucket files:', normalizedFiles);
      const filteredFiles = normalizedFiles.filter((file: string) => {
        if ([...defaultExclusionGlobs, ...exclusionGlobs].some((glob: string) => file.includes(glob))) {
          return false;
        }
        return manifestFileTypes.some((type: string) => file.endsWith(type));
      });
      console.log('[cloneAndAnalyze] Filtered Bitbucket files:', filteredFiles);
      return generateProjectDiffActions(
        filteredFiles,
        snykMonitoredProjects,
        manifestFileTypes,
      );
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
      // Bitbucket Server normalization and filtering
      const normalizedFiles = files.map((file: string) => `${projectKey}/${repoSlug}:${file}`);
      console.log('[cloneAndAnalyze] Normalized Bitbucket Server files:', normalizedFiles);
      const filteredFiles = normalizedFiles.filter((file: string) => {
        if ([...defaultExclusionGlobs, ...exclusionGlobs].some((glob: string) => file.includes(glob))) {
          return false;
        }
        return manifestFileTypes.some((type: string) => file.endsWith(type));
      });
      console.log('[cloneAndAnalyze] Filtered Bitbucket Server files:', filteredFiles);
      return generateProjectDiffActions(
        filteredFiles,
        snykMonitoredProjects,
        manifestFileTypes,
      );
    } else {
      throw new Error('Unknown Bitbucket client type');
    }
  } else {
    // Generic SCM logic
    const { success, repoPath, gitResponse } = await gitClone(
      integrationType,
      repoMetadata,
    );
    debug('Clone response', { success, repoPath, gitResponse });

    if (!success) {
      throw new Error(gitResponse);
    }

    if (!repoPath || typeof repoPath !== 'string') {
      throw new Error('No location returned for clones repo to analyze');
    }
    // Sanitize repoPath to prevent path traversal
    const sanitizedRepoPath = path.resolve('/', repoPath);
    const safeExclusionGlobs = [...defaultExclusionGlobs, ...exclusionGlobs].filter(isSafeGlob);

    // Ensure sanitizedRepoPath is inside allowed directory (e.g., /tmp or working dir)
    const allowedBaseDir = path.resolve(process.cwd());
    if (!sanitizedRepoPath.startsWith(allowedBaseDir)) {
      throw new Error('Path traversal detected: repoPath is outside allowed directory');
    }

    const { files: foundFiles } = await find(
      sanitizedRepoPath,
      safeExclusionGlobs,
      getSCMSupportedManifests(manifestFileTypes, entitlements),
      10,
    );
    const relativeFileNames = foundFiles
      .filter((f: string) => repoPath && f.startsWith(repoPath))
      .map((f: string) => repoPath ? path.relative(repoPath, f) : f);
    debug(`Detected ${foundFiles.length} files in ${repoMetadata.cloneUrl}: ${foundFiles.join(',')}`);

    try {
      if (repoPath) {
        await deleteDirectory(repoPath!);
      }
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
}
