import axios from 'axios';
import type { AxiosInstance } from 'axios';

export type BitbucketAuthType = 'user' | 'basic' | 'oauth' | 'api';

export interface BitbucketAuth {
  type: BitbucketAuthType;
  username?: string;
  appPassword?: string;
  token?: string; // For API or OAuth
}

export class BitbucketCloudSyncClient {
  private client: AxiosInstance;
  private username?: string;
  private appPassword?: string;

  constructor(auth: BitbucketAuth) {
    console.log(`Creating Bitbucket Cloud sync client with auth type ${auth.type}`);
    // Support 'basic' as an alias for user/appPassword basic auth
    if ((auth.type === 'user' || auth.type === 'basic') && auth.username && auth.appPassword) {
      this.username = auth.username;
      this.appPassword = auth.appPassword;
      // Use axios auth option which will set the proper Basic header
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        auth: {
          username: this.username,
          password: this.appPassword,
        },
      });
    } else if (auth.type === 'api' || auth.type === 'oauth') {
      // Ignore username/appPassword for these types
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        headers: {
          authorization: `Bearer ${auth.token}`,
        },
      });
    } else {
      throw new Error('Only Basic Auth, API token, or OAuth token are supported for Bitbucket Cloud sync.');
    }
  }

  async listRepositories(workspace: string) {
    try {
      const encWorkspace = encodeURIComponent(decodeURIComponent(workspace));
      const res = await this.client.get(`/repositories/${encWorkspace}`);
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async getRepository(workspace: string, repoSlug: string) {
    try {
      const encWorkspace = encodeURIComponent(decodeURIComponent(workspace));
      const encRepo = encodeURIComponent(decodeURIComponent(repoSlug));
      const res = await this.client.get(`/repositories/${encWorkspace}/${encRepo}`);
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async listBranches(workspace: string, repoSlug: string) {
    try {
      const encWorkspace = encodeURIComponent(decodeURIComponent(workspace));
      const encRepo = encodeURIComponent(decodeURIComponent(repoSlug));
      const res = await this.client.get(`/repositories/${encWorkspace}/${encRepo}/refs/branches`);
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async listFiles(workspace: string, repoSlug: string, branch: string): Promise<string[]> {
    try {
  // Use max_depth to include subdirectories up to a reasonable limit and follow pagination
  // URL-encode components (especially branch) because branch names can contain slashes
  const encWorkspace = encodeURIComponent(workspace);
  const encRepo = encodeURIComponent(repoSlug);
      // Prevent double-encoding: if branch is already encoded, decode then encode
      let branchToEncode = branch;
      try {
        branchToEncode = decodeURIComponent(branch);
      } catch (e) {
        // ignore decode errors and use raw branch
      }
      const encBranch = encodeURIComponent(branchToEncode);
  let url = `/repositories/${encWorkspace}/${encRepo}/src/${encBranch}/?pagelen=100&max_depth=10`;
  console.log(`[BitbucketCloudSyncClient] Requesting files (recursive): workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}', url='${url}'`);
      const allPaths: string[] = [];
      while (url) {
        const res = await this.client.get(url);
        // Log the actual request URL axios used (config.url) to help diagnose malformed URLs
        try {
          console.log('[BitbucketCloudSyncClient] Requested URL:', res?.config?.url || url);
        } catch (e) {
          console.log('[BitbucketCloudSyncClient] Requested URL (fallback):', url);
        }
        console.log('[BitbucketCloudSyncClient] Raw response page from listFiles:', res?.data?.values?.length ?? 0);
        if (res && res.data && Array.isArray(res.data.values)) {
          // Collect only file entries. API returns objects with type 'commit_file' or 'commit_directory'.
          for (const entry of res.data.values) {
            if (!entry) continue;
            // Some responses may return simple strings in mocked tests — handle both shapes
            if (typeof entry === 'string') {
              allPaths.push(entry);
            } else if (entry.type === 'commit_file' || !entry.type) {
              if (entry.path) allPaths.push(entry.path);
            }
          }
          // Follow pagination if present
          if (res.data.next) {
            url = res.data.next;
          } else {
            url = '';
          }
        } else {
          console.error(`[BitbucketCloudSyncClient] Unexpected response format for workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}'.`);
          break;
        }
      }
      if (allPaths.length === 0) {
        console.warn(`[BitbucketCloudSyncClient] No files found for workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}'. Repo may be empty or branch may not exist.`);
      }
      return allPaths;
    } catch (err: any) {
      // Try to get the request URL that caused the error
      const reqUrl = err?.config?.url || err?.request?.path || 'unknown';
      console.error(`[BitbucketCloudSyncClient] Error listing files for workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}':`, err?.response?.status, err?.response?.statusText, err?.message, 'requestUrl:', reqUrl);
      if (err?.response?.status === 404) {
        throw new Error(`Bitbucket API returned 404 Not Found for ${workspace}/${repoSlug} (url: ${reqUrl}). This may indicate a malformed URL, a missing branch, or insufficient permissions.`);
      }
      this.handleError(err);
    }
    return [];
  }

  private handleError(err: any) {
    if (err.response) {
      if (err.response.status === 429) {
        throw new Error('Bitbucket API rate limit exceeded (429 Too Many Requests)');
      }
      throw new Error(`Bitbucket API error: ${err.response.status} ${err.response.statusText}`);
    }
    throw err;
  }
}
