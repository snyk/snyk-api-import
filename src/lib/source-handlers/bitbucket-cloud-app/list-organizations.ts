// Lists Bitbucket Cloud workspaces (orgs) accessible to the app
import type { BitbucketCloudAppOrgData } from './types';
import needle = require('needle');

export async function listOrganizations(token: string): Promise<BitbucketCloudAppOrgData[]> {
  const url = 'https://api.bitbucket.org/2.0/workspaces';
  const resp = await needle('get', url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (resp.statusCode !== 200 || !resp.body.values) {
    throw new Error(`Failed to list Bitbucket workspaces: ${resp.statusCode}`);
  }
  return resp.body.values.map((w: any) => ({
    uuid: w.uuid,
    name: w.name,
    workspace: w.slug,
  }));
}
