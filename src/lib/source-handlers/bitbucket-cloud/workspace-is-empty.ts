import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { fetchAllBitbucketCloudRepos } from './list-repos';
import { fetchAllWorkspaces } from './list-workspaces';

// workspace renamed as org with project perspective mapping to SnykOrg 
export async function bitbucketCloudWorkspaceIsEmpty(
  org: string,
): Promise<boolean> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  const workspacesList = await fetchAllWorkspaces(bitbucketCloudUsername, bitbucketCloudPassword);
  const repos = await fetchAllBitbucketCloudRepos(
    org,
    workspacesList,
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  return !repos || repos.length === 0;
}
