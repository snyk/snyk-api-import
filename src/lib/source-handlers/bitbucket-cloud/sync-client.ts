import axios from 'axios';
import type { AxiosInstance } from 'axios';
import * as debugLib from 'debug';

const debug = debugLib('snyk:bitbucket-cloud-sync-client');

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
    // Prefer token-based auth (API token or OAuth) when a token is supplied.
    // Otherwise, fall back to username/appPassword Basic auth (user/basic).
    if (auth && auth.token) {
      debug(
        `Creating Bitbucket Cloud sync client using Bearer token (${
          auth.type || 'token'
        })`,
      );
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        headers: {
          authorization: `Bearer ${auth.token}`,
        },
      });
      return;
    }

    // Support 'basic' as an alias for user/appPassword basic auth
    if (
      (auth.type === 'user' || auth.type === 'basic') &&
      auth.username &&
      auth.appPassword
    ) {
      this.username = auth.username;
      this.appPassword = auth.appPassword;
      debug(
        `Creating Bitbucket Cloud sync client using Basic auth (username=${this.username})`,
      );
      // Use axios auth option which will set the proper Basic header
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        auth: {
          username: this.username,
          password: this.appPassword,
        },
      });
      return;
    }

    throw new Error(
      'Only Basic Auth (username/appPassword), API token, or OAuth token are supported for Bitbucket Cloud sync.',
    );
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
      const res = await this.client.get(
        `/repositories/${encWorkspace}/${encRepo}`,
      );
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async listBranches(workspace: string, repoSlug: string) {
    try {
      const encWorkspace = encodeURIComponent(decodeURIComponent(workspace));
      const encRepo = encodeURIComponent(decodeURIComponent(repoSlug));
      const res = await this.client.get(
        `/repositories/${encWorkspace}/${encRepo}/refs/branches`,
      );
      return res.data;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async listFiles(
    workspace: string,
    repoSlug: string,
    branch: string,
  ): Promise<string[]> {
    try {
      // Use max_depth to include subdirectories up to a reasonable limit and follow pagination
      // URL-encode components (especially branch) because branch names can contain slashes
      const encWorkspace = encodeURIComponent(workspace);
      const encRepo = encodeURIComponent(repoSlug);
      // Prevent double-encoding: if branch is already encoded, decode then encode
      // Encode individual path segments so that literal '/' characters in branch
      // names are preserved as separators (Bitbucket expects slashes in branch
      // names to be present, not percent-encoded to %2F).
      let branchToEncode = branch;
      try {
        branchToEncode = decodeURIComponent(branch);
      } catch {
        // ignore decode errors and use raw branch
      }
      // Use the 'at' query parameter to select the branch/commit. This avoids
      // embedding branch names (which may contain '/') in the path and running
      // into inconsistent encoding/404 behavior. Encode the full branch value
      // for use in the query param.
      const encBranchForQuery = encodeURIComponent(branchToEncode);
      let url = `/repositories/${encWorkspace}/${encRepo}/src/?at=${encBranchForQuery}&pagelen=100&max_depth=10`;
      console.log(
        `[BitbucketCloudSyncClient] Requesting files (recursive): workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}', url='${url}'`,
      );
      const allPaths: string[] = [];
      while (url) {
        const res = await this.client.get(url);
        // Log the actual request URL axios used (config.url) to help diagnose malformed URLs
        try {
          console.log(
            '[BitbucketCloudSyncClient] Requested URL:',
            res?.config?.url || url,
          );
        } catch {
          console.log(
            '[BitbucketCloudSyncClient] Requested URL (fallback):',
            url,
          );
        }
        console.log(
          '[BitbucketCloudSyncClient] Raw response page from listFiles:',
          res?.data?.values?.length ?? 0,
        );
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
            // Bitbucket may include un-encoded branch names in the `next` link.
            // Normalize the next URL by ensuring the branch path segment is URL-encoded.
            try {
              const nextRaw: string = res.data.next;
              const normalizedNext = (() => {
                try {
                  // If nextRaw is a relative URL, URL requires a base; use the API base
                  const base = new URL(
                    this.client.defaults.baseURL ||
                      'https://api.bitbucket.org/2.0/',
                  );
                  const u = new URL(nextRaw, base);
                  // If pagination uses query param 'at', normalize that param
                  if (u.searchParams && u.searchParams.has('at')) {
                    try {
                      const rawAt = u.searchParams.get('at') || '';
                      u.searchParams.set(
                        'at',
                        encodeURIComponent(decodeURIComponent(rawAt)),
                      );
                    } catch {
                      // fallback: set encoded value
                      const rawAt = u.searchParams.get('at') || '';
                      u.searchParams.set('at', encodeURIComponent(rawAt));
                    }
                  } else {
                    // Otherwise, try normalizing any 'src' path segment branch value
                    const parts = u.pathname.split('/').map((p) => p);
                    const srcIndex = parts.findIndex((p) => p === 'src');
                    if (srcIndex !== -1 && parts.length > srcIndex + 1) {
                      try {
                        parts[srcIndex + 1] = encodeURIComponent(
                          decodeURIComponent(parts[srcIndex + 1]),
                        );
                      } catch {
                        parts[srcIndex + 1] = encodeURIComponent(
                          parts[srcIndex + 1],
                        );
                      }
                      u.pathname = parts.join('/');
                    }
                  }
                  return u.href;
                } catch {
                  return nextRaw;
                }
              })();
              url = normalizedNext;
            } catch {
              url = res.data.next;
            }
          } else {
            url = '';
          }
        } else {
          console.error(
            `[BitbucketCloudSyncClient] Unexpected response format for workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}'.`,
          );
          break;
        }
      }
      if (allPaths.length === 0) {
        console.warn(
          `[BitbucketCloudSyncClient] No files found for workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}'. Repo may be empty or branch may not exist.`,
        );
      }
      return allPaths;
    } catch (err: any) {
      // Try to get the request URL that caused the error
      const reqUrl = err?.config?.url || err?.request?.path || 'unknown';
      console.error(
        `[BitbucketCloudSyncClient] Error listing files for workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}':`,
        err?.response?.status,
        err?.response?.statusText,
        err?.message,
        'requestUrl:',
        reqUrl,
      );
      if (err?.response?.status === 404) {
        throw new Error(
          `Bitbucket API returned 404 Not Found for ${workspace}/${repoSlug} (url: ${reqUrl}). This may indicate a malformed URL, a missing branch, or insufficient permissions.`,
        );
      }
      this.handleError(err);
    }
    return [];
  }

  private handleError(err: any) {
    if (err.response) {
      // Preserve the original response on the thrown Error so callers can
      // inspect err.response.status (e.g., to treat 401/403 as auth failures).
      if (err.response.status === 429) {
        const e = new Error(
          'Bitbucket API rate limit exceeded (429 Too Many Requests)',
        ) as any;
        e.response = err.response;
        throw e;
      }
      const e = new Error(
        `Bitbucket API error: ${err.response.status} ${err.response.statusText}`,
      ) as any;
      e.response = err.response;
      throw e;
    }
    throw err;
  }
}
