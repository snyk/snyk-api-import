import { BitbucketCloudSyncClient } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import type { BitbucketAuth } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import { defaultExclusionGlobs } from '../../common';
import { getSCMSupportedManifests } from '../../lib';
import type { RepoMetaData, SnykProject, SyncTargetsConfig, Target } from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';

export async function bitbucketCloudCloneAndAnalyze(
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  config: Omit<SyncTargetsConfig, 'dryRun'>,
  bitbucketAuth: BitbucketAuth,
  target: Target,
): Promise<{
  import: string[];
  remove: SnykProject[];
}> {
  const { manifestTypes, entitlements = ['openSource'], exclusionGlobs = [] } = config;
  const manifestFileTypes = manifestTypes && manifestTypes.length > 0
    ? manifestTypes
    : getSCMSupportedManifests(entitlements);

  if (!target.owner || !target.name) {
    throw new Error('Bitbucket Cloud target must have owner and name properties');
  }
  const client = new BitbucketCloudSyncClient(bitbucketAuth);
  const workspace = target.owner;
  const repoSlug = target.name;
  const branch = repoMetadata.branch || 'main';

  // List files using Bitbucket Cloud API
  const files = await client.listFiles(workspace, repoSlug, branch);
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
