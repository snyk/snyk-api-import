
import axios from 'axios';
import { BitbucketCloudSyncClient } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import type { BitbucketAuth } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import { defaultExclusionGlobs } from '../../common';
import { getSCMSupportedManifests } from '../../lib';
import type { RepoMetaData, SnykProject, SyncTargetsConfig, Target } from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';

export type BitbucketClientType = 'cloud' | 'server';


export async function bitbucketCloneAndAnalyze(
  clientType: BitbucketClientType,
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  config: Omit<SyncTargetsConfig, 'dryRun'>,
  auth: BitbucketAuth | { sourceUrl: string; token: string },
  target: Target,
): Promise<{
  import: string[];
  remove: SnykProject[];
}> {
  const { manifestTypes, entitlements = ['openSource'], exclusionGlobs = [] } = config;
  const manifestFileTypes = manifestTypes && manifestTypes.length > 0
    ? manifestTypes
    : getSCMSupportedManifests(entitlements);

  let files: string[] = [];
  if (clientType === 'cloud') {
    if (!target.owner || !target.name) {
      throw new Error('Bitbucket Cloud target must have owner and name properties');
    }
    const client = new BitbucketCloudSyncClient(auth as BitbucketAuth);
    const workspace = target.owner;
    const repoSlug = target.name;
    const branch = repoMetadata.branch || 'main';
    files = await client.listFiles(workspace, repoSlug, branch);
  } else if (clientType === 'server') {
    const projectKey = target.projectKey;
    const repoSlug = target.repoSlug;
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
    } catch (err) {
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
