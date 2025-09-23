// Lists Bitbucket Cloud repositories for a workspace
import type { BitbucketCloudAppRepoData } from './types';
import needle = require('needle');

export async function listRepos(token: string, workspace: string): Promise<BitbucketCloudAppRepoData[]> {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}`;
  const resp = await needle('get', url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (resp.statusCode !== 200 || !resp.body.values) {
    throw new Error(`Failed to list Bitbucket repos: ${resp.statusCode}`);
  }
  return resp.body.values.map((r: any) => ({
    uuid: r.uuid,
    name: r.name,
    workspace,
    isPrivate: r.is_private,
    mainbranch: r.mainbranch?.name,
  }));
}
