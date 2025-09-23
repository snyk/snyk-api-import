// Lists Bitbucket Cloud App repositories for a workspace
import { listRepos } from './list-repos';
import { getBitbucketAppToken } from './get-bitbucket-app-token';
import type { BitbucketAppConfig } from './types';

export async function listBitbucketCloudAppRepos(config: BitbucketAppConfig, workspace: string): Promise<any[]> {
  const token = await getBitbucketAppToken(config);
  return await listRepos(token, workspace);
}
