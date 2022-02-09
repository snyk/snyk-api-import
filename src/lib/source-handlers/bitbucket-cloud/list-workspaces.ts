import * as debugLib from 'debug';
import { OutgoingHttpHeaders } from 'http2';
import base64 = require('base-64');
import { BitbucketCloudWorkspaceData } from './types';
import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { limiterForScm } from '../../limiters';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';

const debug = debugLib('snyk:bitbucket-cloud');

export async function fetchAllWorkspaces(
  username: string,
  password: string,
): Promise<BitbucketCloudWorkspaceData[]> {
  let lastPage = false;
  let workspacesList: BitbucketCloudWorkspaceData[] = [];
  let pageCount = 1;
  let nextPage = '';
  while (!lastPage) {
    debug(`Fetching page ${pageCount}\n`);
    try {
      const { workspaces, next } = await getWorkspaces(
        username,
        password,
        nextPage,
      );
      workspacesList = workspacesList.concat(workspaces);
      next
        ? ((lastPage = false), (nextPage = next))
        : ((lastPage = true), (nextPage = ''));
      pageCount++;
    } catch (err) {
      throw new Error(JSON.stringify(err));
    }
  }
  return workspacesList;
}

export async function getWorkspaces(
  username: string,
  password: string,
  nextPage: string,
): Promise<{ workspaces: BitbucketCloudWorkspaceData[]; next: string }> {
  const workspaces: BitbucketCloudWorkspaceData[] = [];
  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(username + ':' + password)}`,
  };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  let next = '';
  const { statusCode, body } = await limiterWithRateLimitRetries(
    'get',
    nextPage != '' ? nextPage : 'https://bitbucket.org/api/2.0/workspaces',
    headers,
    limiter,
    60000,
  );
  if (statusCode != 200) {
    throw new Error(`Failed to fetch projects for ${
      nextPage != '' ? nextPage : 'https://bitbucket.org/api/2.0/workspaces'
    }\n
      Status Code: ${statusCode}\n
      Response body: ${JSON.stringify(body)}`);
  }
  const values = body['values'];
  next = body['next'];
  for (const workspace of values) {
    workspaces.push({
      name: workspace.slug,
      slug: workspace.slug,
      uuid: workspace.uuid,
    });
  }
  return { workspaces, next };
}

export async function listBitbucketCloudWorkspaces(): Promise<
  BitbucketCloudWorkspaceData[]
> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  debug(`Fetching all workspaces data`);
  const workspaces = await fetchAllWorkspaces(
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  return workspaces;
}
