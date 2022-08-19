import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { fetchAllBitbucketCloudRepos } from './list-repos';
import { fetchAllWorkspaces } from './list-workspaces';
import { BitbucketCloudRepoData } from './types';

export async function bitbucketCloudWorkspaceIsEmpty(
  org: string,
): Promise<boolean> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  const workspaces = await fetchAllWorkspaces(bitbucketCloudUsername, bitbucketCloudPassword);
  let reposList: BitbucketCloudRepoData[] = []; 

  // bitbucket cloud API requires workspace to query repositories
  for (const workspace of workspaces) {
    const repos = await fetchAllBitbucketCloudRepos(
      org,
      workspace.name,
      bitbucketCloudUsername,
      bitbucketCloudPassword,
    );
    reposList = reposList.concat(repos)
  }
  return !reposList || reposList.length === 0;
}
