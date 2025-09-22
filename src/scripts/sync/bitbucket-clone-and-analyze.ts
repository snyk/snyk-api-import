import { BitbucketCloudSyncClient } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import type { BitbucketAuth } from '../../lib/source-handlers/bitbucket-cloud/sync-client';
import { defaultExclusionGlobs } from '../../common';
import { getSCMSupportedManifests } from '../../lib';
import type { RepoMetaData, SnykProject, SyncTargetsConfig, Target } from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';


export async function bitbucketCloneAndAnalyze(
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  config: Omit<SyncTargetsConfig, 'dryRun'>,
  bitbucketAuth: BitbucketAuth,
  target?: Target,
): Promise<{
  import: string[];
  remove: SnykProject[];
}> {
  const { manifestTypes, entitlements = ['openSource'], exclusionGlobs = [] } = config;
  const manifestFileTypes = manifestTypes && manifestTypes.length > 0
    ? manifestTypes
    : getSCMSupportedManifests(entitlements);

  if (!target || !target.owner || !target.name) {
    throw new Error('Bitbucket target must have owner and name properties');
  }
  const client = new BitbucketCloudSyncClient(bitbucketAuth);
  const workspace = target.owner;
  const repoSlug = target.name;
  const branch = repoMetadata.branch || 'main';

  // List files using Bitbucket API
  const files = await client.listFiles(workspace, repoSlug, branch);
  // Filter files by exclusion globs and manifest types
  const filteredFiles = files.filter((file: string) => {
    // Exclude files matching exclusion globs
    if ([...defaultExclusionGlobs, ...exclusionGlobs].some((glob) => file.includes(glob))) {
      return false;
    }
    // Only include files matching manifest types
    return manifestFileTypes.some((type) => file.endsWith(type));
  });

  // Compare files to Snyk monitored projects
  return generateProjectDiffActions(
    filteredFiles,
    snykMonitoredProjects,
    manifestFileTypes,
  );
}
