// Checks if a Bitbucket Cloud App workspace has no repositories
import { organizationIsEmpty } from './organization-is-empty';
import { getBitbucketAppToken } from './get-bitbucket-app-token';
import type { BitbucketAppConfig } from './types';

export async function bitbucketCloudAppWorkspaceIsEmpty(config: BitbucketAppConfig, workspace: string): Promise<boolean> {
  const token = await getBitbucketAppToken(config);
  return await organizationIsEmpty(token, workspace);
}
