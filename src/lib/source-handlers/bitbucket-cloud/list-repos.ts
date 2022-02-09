import * as debugLib from 'debug';
import base64 = require('base-64');
import { OutgoingHttpHeaders } from 'http2';
import { BitbucketCloudRepoData } from './types';
import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { limiterForScm } from '../../limiters';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';

const debug = debugLib('snyk:bitbucket-cloud');

export const fetchAllBitbucketCloudRepos = async (
  workspace: string,
  username: string,
  password: string,
): Promise<BitbucketCloudRepoData[]> => {
  let lastPage = false;
  let reposList: BitbucketCloudRepoData[] = [];
  let pageCount = 1;
  let nextPage = '';
  while (!lastPage) {
    debug(`Fetching page ${pageCount} for ${workspace}\n`);
    try {
      const { repos, next } = await getRepos(
        workspace,
        username,
        password,
        nextPage,
      );

      reposList = reposList.concat(repos);
      next
        ? ((lastPage = false), (nextPage = next))
        : ((lastPage = true), (nextPage = ''));
      pageCount++;
    } catch (err) {
      throw new Error(JSON.stringify(err));
    }
  }
  return reposList;
};

const getRepos = async (
  workspace: string,
  username: string,
  password: string,
  nextPage: string,
): Promise<{ repos: BitbucketCloudRepoData[]; next: string }> => {
  const repos: BitbucketCloudRepoData[] = [];
  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(username + ':' + password)}`,
  };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  const { statusCode, body } = await limiterWithRateLimitRetries(
    'get',
    nextPage ?? `https://bitbucket.org/api/2.0/repositories/${workspace}`,
    headers,
    limiter,
    60000,
  );
  if (statusCode != 200) {
    throw new Error(`Failed to fetch projects for ${nextPage ??
      `https://bitbucket.org/api/2.0/repositories/${workspace}`}\n
      Status Code: ${statusCode}\n
      Response body: ${JSON.stringify(body)}`);
  }
  const values = body['values'];
  const next = body['next'] ?? '';
  for (const repo of values) {
    repos.push({
      owner: repo.workspace.slug ? repo.workspace.slug : repo.workspace.uuid,
      name: repo.slug,
      branch: repo.mainbranch.name ? repo.mainbranch.name : '',
    });
  }
  return { repos, next };
};

export async function listBitbucketCloudRepos(
  workspace: string,
): Promise<BitbucketCloudRepoData[]> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  debug(`Fetching all repos data for org: ${workspace}`);
  const repoList = await fetchAllBitbucketCloudRepos(
    workspace,
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  return repoList;
}
