import * as debugLib from 'debug';
import * as base64 from 'base-64';
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
  debug(
    `Username: ${username ? 'present' : 'absent'}, API Token: ${
      apiToken ? 'present' : 'absent'
    }`,
  );
  let isBasic = false;
  if (username && password) {
    token = `${base64.encode(username + ':' + password)}`;
    isBasic = true;
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
      } = await getWorkspaces(token, nextPageLink, isBasic);
      workspacesList = workspacesList.concat(workspaces);
      if (next) {
        lastPage = false;
        nextPageLink = next;
      } else {
        lastPage = true;
        nextPageLink = '';
      }
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
  isBasic = false,
): Promise<{ workspaces: BitbucketCloudWorkspaceData[]; next?: string }> {
  const workspaces: BitbucketCloudWorkspaceData[] = [];
  const headers: OutgoingHttpHeaders = {
    authorization: isBasic ? `Basic ${token}` : `Bearer ${token}`,
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
  // Historically we required username/app password (Basic auth) for
  // workspace listing, but the underlying API supports bearer tokens too.
  // Accept any available Bitbucket Cloud auth (api, oauth, or user) and
  // translate it to the parameters expected by fetchAllWorkspaces.
  let auth;
  try {
    // Ask getBitbucketCloudAuth() to pick the available auth according to
    // precedence or an explicit BITBUCKET_CLOUD_AUTH_METHOD override.
    auth = getBitbucketCloudAuth();
  } catch {
    throw new Error(
      'Workspace listing requires authentication. Please set one of: BITBUCKET_CLOUD_API_TOKEN, BITBUCKET_CLOUD_OAUTH_TOKEN, or BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD (app password).',
    );
  }
  debug(`Auth: ${JSON.stringify(auth)}`);
  debug(`Fetching all workspaces data`);
  // Map auth types to the fetchAllWorkspaces parameters:
  // - user -> username + appPassword (Basic)
  // - api/oauth -> apiToken (Bearer)
  if (auth.type === 'user') {
    const workspaces = await fetchAllWorkspaces(
      auth.username,
      auth.appPassword,
    );
    return workspaces;
  }
  // api or oauth
  const workspaces = await fetchAllWorkspaces(undefined, undefined, auth.token);
  return workspaces;
}
