
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
      let defaultBranch = '';
      try {
        repoInfo = await client.getRepository(workspace, repoSlug);
        // Log raw repository metadata for debugging/diagnostics
        try {
          console.log(`[cloneAndAnalyze] Raw repoInfo for ${workspace}/${repoSlug}:`, JSON.stringify(repoInfo, null, 2));
        } catch (e) {
          console.log(`[cloneAndAnalyze] Raw repoInfo (stringify failed) for ${workspace}/${repoSlug}:`, repoInfo);
        }
        if (repoInfo?.mainbranch?.name) {
          defaultBranch = repoInfo.mainbranch.name;
        } else {
          // If repository info returns no mainbranch, attempt to find it via branches endpoint
          console.warn(`[Bitbucket] No main branch found in repository info for ${workspace}/${repoSlug}. Attempting to detect default branch via branches API.`);
          try {
            const branchesResp: any = await client.listBranches(workspace, repoSlug);
            // branchesResp may be an object with values array, or an array in some mocks
            const branchValues = Array.isArray(branchesResp)
              ? branchesResp
              : branchesResp?.values || [];
            // Look for explicit default marker
            let detected: string | undefined;
            for (const b of branchValues) {
              if (!b) continue;
              if (b.is_default || b.default || b.name === 'main' || b.name === 'master') {
                detected = b.name || b;
                break;
              }
            }
            if (!detected && branchValues.length > 0) {
              // fall back to first branch name
              const first = branchValues[0];
              detected = typeof first === 'string' ? first : first.name;
            }
            if (detected) {
              defaultBranch = detected;
              console.info(`[Bitbucket] Detected default branch for ${workspace}/${repoSlug} via branches API: ${defaultBranch}`);
            } else {
              console.warn(`[Bitbucket] Could not detect default branch via branches API for ${workspace}/${repoSlug}. Falling back to provided branch if available.`);
              defaultBranch = target?.branch || repoMetadata.branch || '';
            }
          } catch (err) {
            console.warn(`[Bitbucket] Failed to detect default branch via branches API for ${workspace}/${repoSlug}: ${err?.message}. Falling back to provided branch.`);
            defaultBranch = target?.branch || repoMetadata.branch || '';
          }
        }
      } catch (err: any) {
        // Authorization errors — hard fail to avoid making changes
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          const msg = `[Bitbucket] Authorization failed for ${workspace}/${repoSlug}: ${err.message}`;
          console.error(msg);
          throw new Error(msg);
        }
        // Non-auth errors — fall back to provided branch (helps tests and transient errors)
        console.warn(`[Bitbucket] Could not fetch repository info for ${workspace}/${repoSlug}: ${err?.message}. Falling back to provided branch if available.`);
        defaultBranch = target?.branch || repoMetadata.branch || '';
      }
      if (!defaultBranch) {
        const msg = `[Bitbucket] Could not determine default branch for ${workspace}/${repoSlug}.`;
        console.error(msg);
        throw new Error(msg);
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
      // generateProjectDiffActions expects repo manifest paths (the part after ':')
      const manifestPaths = filteredFiles.map((f: string) => (f.includes(':') ? f.split(':')[1] : f));
      console.log('[cloneAndAnalyze] Manifest paths passed to diff generator:', manifestPaths);
      return generateProjectDiffActions(
        manifestPaths,
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
        if (res.status === 401 || res.status === 403) {
          const msg = `[Bitbucket Server] Authorization failed for ${projectKey}/${repoSlug}: ${res.status} ${res.statusText}`;
          console.error(msg);
          throw new Error(msg);
        }
        if (res.status === 200 && Array.isArray(res.data.values)) {
          files = res.data.values;
        } else if (res.status && res.status !== 200) {
          const msg = `[Bitbucket Server] Unexpected response listing files for ${projectKey}/${repoSlug}: ${res.status} ${res.statusText}`;
          console.warn(msg);
        }
      } catch (err: any) {
        if (err?.response && (err.response.status === 401 || err.response.status === 403)) {
          const msg = `[Bitbucket Server] Authorization failed when listing files for ${projectKey}/${repoSlug}: ${err.message}`;
          console.error(msg);
          throw new Error(msg);
        }
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
      // generateProjectDiffActions expects repo manifest paths (the part after ':')
      const manifestPaths = filteredFiles.map((f: string) => (f.includes(':') ? f.split(':')[1] : f));
      console.log('[cloneAndAnalyze] Manifest paths passed to diff generator (server):', manifestPaths);
      return generateProjectDiffActions(
        manifestPaths,
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
    // Propagate branch info for Bitbucket Cloud only via repoMetadata earlier; return diffActions for generic SCM
    return diffActions;
}
}
