import { getBitbucketServerToken } from './get-bitbucket-server-token';
import { fetchAllRepos } from './list-repos';
import { BitbucketServerRepoData } from './types';

export async function bitbucketServerProjectIsEmpty(
  projectKey: string,
  sourceUrl?: string,
): Promise<boolean> {
  const bitbucketServerToken = getBitbucketServerToken();
  if (!sourceUrl) {
    throw new Error(
      'Please provide required `sourceUrl` for Bitbucket Server source',
    );
  }
  const repos = (await fetchAllRepos(
    sourceUrl,
    projectKey,
    bitbucketServerToken,
  )) as BitbucketServerRepoData[];
  if (!repos || repos.length === 0) {
    return true;
  }
  return false;
}
