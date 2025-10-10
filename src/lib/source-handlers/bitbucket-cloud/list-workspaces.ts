import * as debugLib from 'debug';
import base64 = require('base-64');
import type { OutgoingHttpHeaders } from 'http2';
import type { BitbucketCloudWorkspaceData } from './types';
import { getBitbucketCloudAuth } from './get-bitbucket-cloud-auth';
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
  username?: string,
  password?: string,
  apiToken?: string,
): Promise<BitbucketCloudWorkspaceData[]> {
  let lastPage = false;
  let workspacesList: BitbucketCloudWorkspaceData[] = [];
  let pageCount = 1;
  let nextPageLink: string | undefined = undefined;
  let token: string;
  debug(`Username: ${username}, Password: ${password}, API Token: ${apiToken}`);
  if (username && password) {
    token = `${base64.encode(username + ':' + password)}`;
  } else if (apiToken) {
    token = apiToken;
  } else {
    throw new Error('Username/password or API token is required');
  }
  while (!lastPage) {
    debug(`Fetching page ${pageCount}\n`);
    try {
      const {
        workspaces,
        next,
      }: {
        workspaces: BitbucketCloudWorkspaceData[];
        next?: string;
      } = await getWorkspaces(token, nextPageLink);
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
  token: string,
  nextPageLink?: string,
): Promise<{ workspaces: BitbucketCloudWorkspaceData[]; next?: string }> {
  const workspaces: BitbucketCloudWorkspaceData[] = [];
  const headers: OutgoingHttpHeaders = {
    authorization: `Bearer ${token}`,
  };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  const workspacesUrl =
    nextPageLink ?? 'https://api.bitbucket.org/2.0/workspaces?pagelen=100';
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
  const auth = getBitbucketCloudAuth();
  debug(`Auth: ${JSON.stringify(auth)}`);
  debug(`Fetching all workspaces data`);
  if (auth.type === 'user') {
    const workspaces = await fetchAllWorkspaces(auth.username, auth.password);
    console.log(workspaces);
    return workspaces;
  }
  if (auth.type === 'api' || auth.type === 'oauth') {
    const workspaces = await fetchAllWorkspaces(
      undefined,
      undefined,
      auth.token,
    );
    console.log(workspaces);
    return workspaces;
  }
  // For API/OAuth tokens, Bitbucket Cloud does not support listing workspaces via token alone
  throw new Error(
    'Workspace listing requires username/password (app password).',
  );
}
