import type { BitbucketCloudAuthConfig } from './types';
import { getBitbucketCloudToken } from './get-token';
import * as needle from 'needle';

export async function bitbucketCloudWorkspaceIsEmpty(
  config: BitbucketCloudAuthConfig,
  workspace: string,
): Promise<boolean> {
  const token = await getBitbucketCloudToken(config);
  let headers;
  if (config.type === 'user') {
    headers = { authorization: `Basic ${token}` };
  } else {
    headers = { authorization: `Bearer ${token}` };
  }
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}`;
  const resp = await needle('get', url, { headers });
  if (resp.statusCode !== 200) {
    throw new Error(`Failed to check workspace repos: ${resp.statusCode}`);
  }
  return !resp.body.values || resp.body.values.length === 0;
}
