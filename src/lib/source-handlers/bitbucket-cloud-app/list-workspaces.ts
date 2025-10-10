import type { BitbucketWorkspace } from './types';
import * as needle from 'needle';
import { getBitbucketAppToken } from './get-bitbucket-app-token';

export async function listBitbucketCloudAppWorkspaces(
  apiBase?: string,
): Promise<BitbucketWorkspace[]> {
  const token = await getBitbucketAppToken();
  const base =
    apiBase ||
    process.env.BITBUCKET_APP_API_BASE ||
    'https://api.bitbucket.org/2.0';

  const url = `${base}/workspaces`;

  const headers: Record<string, string> = {};
  headers['authorization'] = `Bearer ${token}`;
  headers['user-agent'] = 'snyk-api-import';

  const res = await needle('get', url, { headers });

  if (!res || !res.body || !res.body.values) {
    return [];
  }

  return res.body.values.map((v: any) => ({
    uuid: v.uuid,
    name: v.name,
    slug: v.slug,
  }));
}

export async function bitbucketCloudAppWorkspaceIsEmpty(
  workspace: any,
  apiBase?: string,
): Promise<boolean> {
  const base =
    apiBase ||
    process.env.BITBUCKET_APP_API_BASE ||
    'https://api.bitbucket.org/2.0';
  const url = `${base}/repositories/${workspace}`;
  const token = await getBitbucketAppToken();
  const headers: Record<string, string> = {};
  headers['authorization'] = `Bearer ${token}`;
  headers['user-agent'] = 'snyk-api-import';

  const res = await needle('get', url, { headers });
  if (!res || !res.body) return true;
  return !(res.body.size && res.body.size > 0);
}
