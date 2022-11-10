import * as debugLib from 'debug';
import { OutgoingHttpHeaders } from 'http2';
import base64 = require('base-64');
import { BitbucketCloudWorkspaceData } from './types';
import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';
import { limiterForScm } from '../../limiters';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';

const debug = debugLib('snyk:bitbucket-cloud');

interface BitbucketWorkspacesResponse {
  values: {
    slug: string;
    uuid: string;
  }[];
  next?: string;
}
export async function fetchAllWorkspaces(
  username: string,
  password: string,
): Promise<BitbucketCloudWorkspaceData[]> {
  let lastPage = false;
  let workspacesList: BitbucketCloudWorkspaceData[] = [];
  let pageCount = 1;
  let nextPageLink: string | undefined = undefined;
  while (!lastPage) {
    debug(`Fetching page ${pageCount}\n`);
    try {
      const {
        workspaces,
        next,
      }: {
        workspaces: BitbucketCloudWorkspaceData[];
        next?: string;
      } = await getWorkspaces(username, password, nextPageLink);
      workspacesList = workspacesList.concat(workspaces);
      next
        ? ((lastPage = false), (nextPageLink = next))
        : ((lastPage = true), (nextPageLink = ''));
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
  nextPageLink?: string,
): Promise<{ workspaces: BitbucketCloudWorkspaceData[]; next?: string }> {
  const workspaces: BitbucketCloudWorkspaceData[] = [];
  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(username + ':' + password)}`,
  };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  const workspacesUrl =
    nextPageLink ?? 'https://bitbucket.org/api/2.0/workspaces?pagelen=100';
  const { statusCode, body } =
    await limiterWithRateLimitRetries<BitbucketWorkspacesResponse>(
      'get',
      workspacesUrl,
      headers,
      limiter,
      60000,
    );

  if (statusCode != 200) {
    throw new Error(`Failed to fetch ${workspacesUrl}\n
      Status Code: ${statusCode}\n
      Response body: ${JSON.stringify(body)}`);
  }
  const { values, next } = body;

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
