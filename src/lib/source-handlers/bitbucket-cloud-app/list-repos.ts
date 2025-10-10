import type { BitbucketRepoData } from './types';
import * as debugLib from 'debug';
import * as needle from 'needle';
import { getBitbucketAppToken } from './get-bitbucket-app-token';

const debug = debugLib('snyk:bitbucket-cloud-app');

export async function listBitbucketCloudAppRepos(
  workspace: string,
): Promise<BitbucketRepoData[]> {
  const base =
    process.env.BITBUCKET_APP_API_BASE || 'https://api.bitbucket.org/2.0';
  const url = `${base}/repositories/${workspace}`;
  let repos: BitbucketRepoData[] = [];
  let nextUrl: string | undefined = url;
  let page = 1;

  const token = await getBitbucketAppToken();
  const headers: Record<string, string> = {};
  headers['authorization'] = `Bearer ${token}`;
  headers['user-agent'] = 'snyk-api-import';

  while (nextUrl) {
    debug(`Fetching page ${page} for ${workspace} (app)`);
    const resp: needle.NeedleResponse = await needle('get', nextUrl, {
      headers,
    });
    // Explicitly handle common HTTP failure modes so callers get a clear
    // diagnostic message when app-scoped tokens lack permissions or the
    // workspace does not exist or is not visible to the app.
    if (resp.statusCode === 401 || resp.statusCode === 403) {
      throw new Error(
        `Bitbucket Cloud App authorization failed when listing repos for workspace '${workspace}': ${resp.statusCode}. Ensure the app client id/secret are correct and that the app is installed with repository read permissions.`,
      );
    }
    if (resp.statusCode === 404) {
      throw new Error(
        `Bitbucket Cloud App workspace '${workspace}' not found (404). Verify the workspace slug and that the app has access to the workspace.`,
      );
    }
    if (!resp.body || !resp.body.values) {
      throw new Error(
        `Unexpected response when listing Bitbucket Cloud App repos for workspace '${workspace}'. HTTP status: ${resp && resp.statusCode}. Body: ${JSON.stringify(
          resp && resp.body,
        )}`,
      );
    }
    // If the first page contains no repos, warn explicitly. This typically
    // means the app is not installed on the workspace or the app token lacks
    // permissions to list repositories.
    if (page === 1 && Array.isArray(resp.body.values) && resp.body.values.length === 0) {
      console.warn(
        `[Bitbucket Cloud App] No repositories returned for workspace '${workspace}' (page=1). The app may not be installed on this workspace or may lack repository read permissions.`,
      );
    }

    repos = repos.concat(
      resp.body.values.map((r: any) => ({
        fork: !!r.fork_policy || false,
        name: r.slug || r.name,
        // keep upstream field name for convenience
        // eslint-disable-next-line @typescript-eslint/naming-convention
        full_name: r.full_name,
        owner: r.workspace?.slug || r.workspace?.uuid || workspace,
        branch: r.mainbranch?.name || 'main',
      })),
    );
    nextUrl = resp.body.next;
    page++;
  }

  return repos;
}

export const listBitbucketCloudAppReposDefault = listBitbucketCloudAppRepos;
