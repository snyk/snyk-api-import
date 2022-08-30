import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { fetchAllBitbucketCloudRepos } from './list-repos';
import { fetchAllWorkspaces } from './list-workspaces';
import { BitbucketCloudRepoData } from './types';

// sourceUrl argument is used to specify workspace name
export async function bitbucketCloudWorkspaceIsEmpty(
  org: string,
  sourceUrl?: string,
): Promise<boolean> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  let repos: BitbucketCloudRepoData[] = []
  let isEmpty = true;

  if (!sourceUrl) {
    // search all bitbucket cloud workspaces if workspace is not specified
    const workspaces = await fetchAllWorkspaces(bitbucketCloudUsername, bitbucketCloudPassword);
    let i = 0;
    while (i < workspaces.length && isEmpty){
      repos = await fetchAllBitbucketCloudRepos(
        org,
        workspaces[i].name,
        bitbucketCloudUsername,
        bitbucketCloudPassword,
      );
      isEmpty = (!repos || repos.length === 0);
      i++;
    }
  }
  else {
    repos = await fetchAllBitbucketCloudRepos(
      org,
      sourceUrl,
      bitbucketCloudUsername,
      bitbucketCloudPassword,
    );
    isEmpty = (!repos || repos.length === 0);
  }

  return isEmpty;
}
