import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { fetchAllBitbucketCloudRepos } from './list-repos';

export async function bitbucketCloudWorkspaceIsEmpty(
  workspace: string,
): Promise<boolean> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  const repos = await fetchAllBitbucketCloudRepos(
    workspace,
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  return !repos || repos.length === 0;
}
