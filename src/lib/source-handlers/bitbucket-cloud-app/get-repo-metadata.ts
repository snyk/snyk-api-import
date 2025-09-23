// Gets metadata for a Bitbucket Cloud repository
import needle = require('needle');
import type { BitbucketCloudAppRepoData } from './types';

export async function getRepoMetadata(token: string, workspace: string, repoSlug: string): Promise<BitbucketCloudAppRepoData> {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}`;
  const resp = await needle('get', url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (resp.statusCode !== 200) {
    throw new Error(`Failed to get repo metadata: ${resp.statusCode}`);
  }
  return {
    uuid: resp.body.uuid,
    name: resp.body.name,
    workspace,
    isPrivate: resp.body.is_private,
    mainbranch: resp.body.mainbranch?.name,
  };
}
