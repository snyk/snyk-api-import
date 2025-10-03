import * as debugLib from 'debug';
import type { BitbucketCloudRepoData, BitbucketCloudAuthConfig } from './types';
import { getBitbucketCloudToken } from './get-token';
import needle = require('needle');

const debug = debugLib('snyk:bitbucket-cloud');




export async function listRepos(config: BitbucketCloudAuthConfig, workspace: string): Promise<BitbucketCloudRepoData[]> {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}`;
  let repos: BitbucketCloudRepoData[] = [];
  let nextUrl: string | undefined = url;
  let pageCount = 1;
  let headers: any = {};
  if (config.type === 'api' || config.type === 'oauth') {
    headers = { authorization: `Bearer ${config.token}` };
  } else if (config.type === 'user') {
    const token = await getBitbucketCloudToken(config);
    headers = { authorization: `Basic ${token}` };
  }
  while (nextUrl) {
    debug(`Fetching page ${pageCount} for ${workspace}`);
    const resp: needle.NeedleResponse = await needle('get', nextUrl, { headers });
    if (resp.statusCode !== 200 || !resp.body.values) {
      throw new Error(`Failed to list Bitbucket repos: ${resp.statusCode}`);
    }
    repos = repos.concat(
      resp.body.values.map((r: any) => ({
        owner: r.workspace?.slug || r.workspace?.uuid || workspace,
        name: r.slug || r.name,
        branch: r.mainbranch?.name || '',
      }))
    );
    nextUrl = resp.body.next;
    pageCount++;
  }
  return repos;
}

export const listBitbucketCloudRepos = listRepos;
