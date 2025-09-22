// Placeholder for Bitbucket Data Center (Server) sync logic
// Implement using Bitbucket Data Center API client and match the interface of bitbucketCloudCloneAndAnalyze
import { defaultExclusionGlobs } from '../../common';
import { getSCMSupportedManifests } from '../../lib';
import type { RepoMetaData, SnykProject, SyncTargetsConfig, Target } from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';

export async function bitbucketDatacenterCloneAndAnalyze(
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  config: Omit<SyncTargetsConfig, 'dryRun'>,
  datacenterAuth: any, // Replace with proper type for Data Center auth
  target: Target,
): Promise<{
  import: string[];
  remove: SnykProject[];
}> {
  // TODO: Implement Data Center API client logic here
  // Example:
  // const client = new BitbucketDatacenterSyncClient(datacenterAuth);
  // const files = await client.listFiles(...);
  // Suppress unused parameter lint errors
  void datacenterAuth;
  void target;
  const files: string[] = []; // Replace with actual API call
  const { manifestTypes, entitlements = ['openSource'], exclusionGlobs = [] } = config;
  const manifestFileTypes = manifestTypes && manifestTypes.length > 0
    ? manifestTypes
    : getSCMSupportedManifests(entitlements);

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
