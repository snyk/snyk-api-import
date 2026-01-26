import axios from 'axios';
import type { AxiosInstance } from 'axios';
import debugLib from 'debug';

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
    // Support both Basic (username/appPassword) and token-based (API/OAuth)
    // auth for Bitbucket Cloud API calls. Token-based auth is used by the
    // Bitbucket Cloud App (client_credentials) flow and is acceptable for
    // API-based operations such as listing repositories and files. Note
    // that token auth does not provide git clone credentials; clones still
    // require app-password or SSH keys when needed.
    if (auth && auth.token) {
      debug('Creating Bitbucket Cloud sync client using token-based auth');
      this.client = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0/',
        headers: { authorization: `Bearer ${auth.token}` },
        maxRedirects: 10,
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
        // Ensure redirects are followed predictably when Bitbucket returns
        // a 302 -> /src/{sha}/ redirect. Follow up to 10 redirects.
        maxRedirects: 10,
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
      const encWorkspace = encodeURIComponent(decodeURIComponent(workspace));
      const encRepo = encodeURIComponent(decodeURIComponent(repoSlug));
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
      // Resolve branch name to a commit SHA when possible. Some Bitbucket
      // API variants or repo setups can parse branch names with '/' badly
      // (e.g., treating 'feature/dev' as 'feature'). Resolving to a commit
      // SHA and using that for the `at` param is more robust.
      let resolvedSha: string | undefined;
      try {
        const branchSearchRes = await this.client.get(
          `/repositories/${encWorkspace}/${encRepo}/refs/branches`,
          {
            params: {
              q: `name = "${branchToEncode}"`,
              pagelen: 1,
            },
          },
        );
        if (
          branchSearchRes &&
          branchSearchRes.data &&
          Array.isArray(branchSearchRes.data.values) &&
          branchSearchRes.data.values.length > 0
        ) {
          const first = branchSearchRes.data.values[0];
          const target = first?.target;
          // Bitbucket responses can vary: target.hash, target.sha, or
          // target.shas (array) are all observed in different API shapes.
          if (target) {
            if (typeof target === 'string') {
              resolvedSha = target;
            } else if (target.hash) {
              resolvedSha = target.hash;
            } else if (target.sha) {
              resolvedSha = target.sha;
            } else if (Array.isArray(target.shas) && target.shas.length > 0) {
              resolvedSha = target.shas[0];
            }
          }
          // Also check for older shapes where the 'shas' array may be on the
          // parent object (e.g., error payloads / refs responses in some
          // configurations).
          if (!resolvedSha && Array.isArray(first?.shas) && first.shas.length) {
            resolvedSha = first.shas[0];
          }
          if (resolvedSha) {
            debug(
              `[BitbucketCloudSyncClient] Resolved branch '${branch}' to commit ${resolvedSha}`,
            );
          }
        }
      } catch {
        // If the query-based lookup fails (permissions, parsing), try a
        // direct branch ref endpoint which accepts the branch name as a
        // path segment. Some Bitbucket setups return data for the direct
        // ref endpoint even when the search query does not match.
        try {
          const directRef = await this.client.get(
            `/repositories/${encWorkspace}/${encRepo}/refs/branches/${encodeURIComponent(
              branchToEncode,
            )}`,
          );
          const directFirst = directRef?.data;
          // directFirst may be the branch object itself
          const directTarget = directFirst?.target || directFirst;
          if (directTarget) {
            if (directTarget.hash) resolvedSha = directTarget.hash;
            else if (directTarget.sha) resolvedSha = directTarget.sha;
            else if (
              Array.isArray(directTarget.shas) &&
              directTarget.shas.length
            )
              resolvedSha = directTarget.shas[0];
          }
          if (resolvedSha) {
            debug(
              `[BitbucketCloudSyncClient] Resolved branch '${branch}' to commit ${resolvedSha} via direct refs/branches/{branch}`,
            );
          }
        } catch {
          // As a last resort, try the commits endpoint for the branch; this
          // returns commits for the branch and the first entry has the hash.
          try {
            const commitsRes = await this.client.get(
              `/repositories/${encWorkspace}/${encRepo}/commits/${encodeURIComponent(
                branchToEncode,
              )}`,
              { params: { pagelen: 1 } },
            );
            if (
              commitsRes &&
              commitsRes.data &&
              Array.isArray(commitsRes.data.values) &&
              commitsRes.data.values.length > 0
            ) {
              resolvedSha =
                commitsRes.data.values[0]?.hash ||
                commitsRes.data.values[0]?.sha;
              if (resolvedSha) {
                debug(
                  `[BitbucketCloudSyncClient] Resolved branch '${branch}' to commit ${resolvedSha} via commits/{branch}`,
                );
              }
            }
          } catch {
            // ignore and fall back to using the branch name
          }
        }
      }

      // Prefer using the path-style URL with the commit SHA when available
      // because Bitbucket sometimes mis-parses branch names that contain
      // slashes (e.g., feature/dev). Using the SHA as a path segment avoids
      // that ambiguity and is more reliable.
      let url: string;
      if (resolvedSha) {
        // Use path-style with SHA as the segment
        url = `/repositories/${encWorkspace}/${encRepo}/src/${encodeURIComponent(
          resolvedSha,
        )}/?pagelen=100&max_depth=10`;
      } else {
        // Fall back to query-param form when SHA not resolved
        const encBranchForQuery = encodeURIComponent(branchToEncode);
        url = `/repositories/${encWorkspace}/${encRepo}/src/?at=${encBranchForQuery}&pagelen=100&max_depth=10`;
      }
      debug(
        `[BitbucketCloudSyncClient] Requesting files (recursive): workspace='${workspace}', repoSlug='${repoSlug}', branch='${branch}', url='${url}'`,
      );
      const allPaths: string[] = [];
      while (url) {
        let res;
        try {
          res = await this.client.get(url);
        } catch (err: any) {
          // If Bitbucket returns 404 for the query-param form, try to
          // recover using any candidate commit SHAs returned in the error
          // payload (some Bitbucket responses include `error.data.shas`) or
          // fall back to path-style forms.
          if (err?.response?.status === 404) {
            try {
              const body = err.response?.data || {};
              // Try common shapes: { error: { data: { shas: [...] } } } or { data: { shas: [...] } }
              const candidateShas =
                body?.error?.data?.shas || body?.data?.shas || body?.shas;
              if (Array.isArray(candidateShas) && candidateShas.length > 0) {
                const candidateSha = candidateShas[0];
                if (candidateSha && typeof candidateSha === 'string') {
                  const shaUrl = `/repositories/${encWorkspace}/${encRepo}/src/?at=${encodeURIComponent(
                    candidateSha,
                  )}&pagelen=100&max_depth=10`;
                  debug(
                    `[BitbucketCloudSyncClient] 404 contained candidate shas; retrying with sha ${candidateSha}: ${shaUrl}`,
                  );
                  res = await this.client.get(shaUrl);
                }
              }
            } catch {
              // ignore and proceed to existing path-style fallbacks
            }
            try {
              // Try encoded branch in the path first: some Bitbucket API
              // variants expect the branch path segment to be percent-encoded
              // (e.g., feature%2Fdev) rather than a raw 'feature/dev' segment.
              const encBranchPath = encodeURIComponent(
                (() => {
                  try {
                    return decodeURIComponent(branch);
                  } catch {
                    return branch;
                  }
                })(),
              );
              const altUrl = `/repositories/${encWorkspace}/${encRepo}/src/${encBranchPath}/?pagelen=100&max_depth=10`;
              debug(
                `[BitbucketCloudSyncClient] Query-param listing returned 404; retrying with encoded path-style URL: ${altUrl}`,
              );
              res = await this.client.get(altUrl);
            } catch {
              try {
                // If encoded path also fails, try the raw branch in the path
                // (literal slashes) which some setups expect.
                const branchRaw = (() => {
                  try {
                    return decodeURIComponent(branch);
                  } catch {
                    return branch;
                  }
                })();
                const altUrlRaw = `/repositories/${encWorkspace}/${encRepo}/src/${branchRaw}/?pagelen=100&max_depth=10`;
                debug(
                  `[BitbucketCloudSyncClient] Encoded path retry failed; retrying with raw path-style URL: ${altUrlRaw}`,
                );
                res = await this.client.get(altUrlRaw);
              } catch {
                // rethrow original error to be handled below
                throw err;
              }
            }
          } else {
            throw err;
          }
        }
        // Log the actual request URL axios used (config.url) to help diagnose malformed URLs
        try {
          debug(
            '[BitbucketCloudSyncClient] Requested URL:',
            res?.config?.url || url,
          );
        } catch {
          console.log(
            '[BitbucketCloudSyncClient] Requested URL (fallback):',
            url,
          );
        }
        debug(
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
          debug(
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
      // When Bitbucket responds 404, surface the response body and headers to
      // aid debugging of malformed 'at' params, permission issues, or API
      // gateway differences. This information is intentionally logged here
      // (not thrown) so the operator can inspect the exact shape returned by
      // the server.
      if (err?.response?.status === 404) {
        try {
          const respData = err.response?.data;
          const respHeaders = err.response?.headers;
          // Log response body message but avoid logging full body which may contain credentials
          const bodyMessage =
            (respData && typeof respData === 'object' && respData.message) ||
            (typeof respData === 'string' ? respData : 'No message');
          console.error(
            `[BitbucketCloudSyncClient] 404 response message for ${workspace}/${repoSlug}:`,
            bodyMessage,
          );
          // Sanitize headers to remove potentially sensitive auth headers
          const sanitizedHeaders: Record<string, unknown> = {};
          if (respHeaders) {
            for (const [key, value] of Object.entries(respHeaders)) {
              // Skip auth-related headers that might contain tokens
              if (
                !key.toLowerCase().includes('auth') &&
                !key.toLowerCase().includes('token') &&
                !key.toLowerCase().includes('authorization')
              ) {
                sanitizedHeaders[key] = value;
              }
            }
          }
          console.error(
            `[BitbucketCloudSyncClient] 404 response headers (sanitized) for ${workspace}/${repoSlug}:`,
            JSON.stringify(sanitizedHeaders, null, 2),
          );
        } catch (dumpErr) {
          console.error(
            '[BitbucketCloudSyncClient] Failed to stringify 404 response',
            dumpErr,
          );
        }
        throw new Error(
          `Bitbucket API returned 404 Not Found for ${workspace}/${repoSlug} (url: ${reqUrl}). This may indicate a malformed URL, a missing branch, or insufficient permissions. See logs for response body and headers.`,
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
