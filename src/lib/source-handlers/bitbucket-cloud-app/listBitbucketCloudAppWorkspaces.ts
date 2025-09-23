// Lists Bitbucket Cloud App workspaces (orgs)
import { listOrganizations } from './list-organizations';
import { getBitbucketAppToken } from './get-bitbucket-app-token';
import type { BitbucketAppConfig } from './types';

export async function listBitbucketCloudAppWorkspaces(config: BitbucketAppConfig): Promise<any[]> {
  const token = await getBitbucketAppToken(config);
  return await listOrganizations(token);
}
