import * as debugLib from 'debug';
import type { BitbucketCloudRepoData, BitbucketCloudAuthConfig } from './types';
import { getBitbucketCloudToken } from './get-token';
import needle = require('needle');

const debug = debugLib('snyk:bitbucket-cloud');




export async function listRepos(config: BitbucketCloudAuthConfig, workspace: string): Promise<BitbucketCloudRepoData[]> {
  const token = await getBitbucketCloudToken(config);
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}`;
  let repos: BitbucketCloudRepoData[] = [];
  let nextUrl: string | undefined = url;
  let pageCount = 1;
  while (nextUrl) {
    debug(`Fetching page ${pageCount} for ${workspace}`);
    let headers;
    if (config.type === 'user') {
      headers = { authorization: `Basic ${token}` };
    } else {
      headers = { authorization: `Bearer ${token}` };
    }
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
