import * as debugLib from 'debug';
const debug = debugLib('snyk:bitbucket-cloud-auth');

export type BitbucketCloudAuthMethod =
  | { type: 'api'; token: string }
  | { type: 'oauth'; token: string }
  | { type: 'user'; username: string; appPassword: string; password?: string };

export function getAvailableBitbucketCloudAuths(): {
  api?: string;
  oauth?: string;
  user?: { username: string; password: string };
} {
  // Treat empty or whitespace-only env vars as unset to avoid accidental
  // selection of an invalid token.
  const rawApi = process.env.BITBUCKET_CLOUD_API_TOKEN;
  const rawOauth = process.env.BITBUCKET_CLOUD_OAUTH_TOKEN;
  const rawUsername = process.env.BITBUCKET_CLOUD_USERNAME;
  const rawPassword = process.env.BITBUCKET_CLOUD_PASSWORD;

  const api = rawApi && rawApi.trim().length > 0 ? rawApi.trim() : undefined;
  const oauth =
    rawOauth && rawOauth.trim().length > 0 ? rawOauth.trim() : undefined;
  const username =
    rawUsername && rawUsername.trim().length > 0
      ? rawUsername.trim()
      : undefined;
  const password =
    rawPassword && rawPassword.trim().length > 0
      ? rawPassword.trim()
      : undefined;

  return {
    api: api || undefined,
    oauth: oauth || undefined,
    user: username && password ? { username, password } : undefined,
  };
}

/**
 * Get a Bitbucket Cloud auth method.
 *
 * If `method` is provided it will attempt to return that specific auth and
 * throw if not available. If not provided, selection follows precedence:
 * API token -> OAuth token -> username+password (Basic).
 *
 * This allows all env vars to be set; callers that need a specific auth should
 * request it explicitly via the `method` parameter.
 */
export function getBitbucketCloudAuth(
  method?: 'api' | 'oauth' | 'user',
): BitbucketCloudAuthMethod {
  const { api, oauth, user } = getAvailableBitbucketCloudAuths();
  // If the caller explicitly requested a method, try to return it and
  // provide a clear error if it's missing.
  if (method === 'api') {
    if (api) return { type: 'api', token: api };
    throw new Error(
      'Requested Bitbucket Cloud API token, but BITBUCKET_CLOUD_API_TOKEN is not set.',
    );
  }
  if (method === 'oauth') {
    if (oauth) return { type: 'oauth', token: oauth };
    throw new Error(
      'Requested Bitbucket Cloud OAuth token, but BITBUCKET_CLOUD_OAUTH_TOKEN is not set.',
    );
  }
  if (method === 'user') {
    if (user)
      return {
        type: 'user',
        username: user.username,
        appPassword: user.password,
        password: user.password,
      };
    throw new Error(
      'Requested Bitbucket Cloud username/password, but BITBUCKET_CLOUD_USERNAME or BITBUCKET_CLOUD_PASSWORD is not set.',
    );
  }
  // If an environment-level override is set, honor it (unless the caller
  // explicitly provided a method via the function parameter above).
  const override = (
    process.env.BITBUCKET_CLOUD_AUTH_METHOD || ''
  ).toLowerCase();
  if (override) {
    if (override === 'api') {
      if (api) return { type: 'api', token: api };
      throw new Error(
        'BITBUCKET_CLOUD_AUTH_METHOD is set to "api" but BITBUCKET_CLOUD_API_TOKEN is not present or is invalid.',
      );
    }
    if (override === 'oauth') {
      if (oauth) return { type: 'oauth', token: oauth };
      throw new Error(
        'BITBUCKET_CLOUD_AUTH_METHOD is set to "oauth" but BITBUCKET_CLOUD_OAUTH_TOKEN is not present or is invalid.',
      );
    }
    if (override === 'user') {
      if (user)
        return {
          type: 'user',
          username: user.username,
          appPassword: user.password,
          password: user.password,
        };
      throw new Error(
        'BITBUCKET_CLOUD_AUTH_METHOD is set to "user" but BITBUCKET_CLOUD_USERNAME or BITBUCKET_CLOUD_PASSWORD is not present or is invalid.',
      );
    }
    // Invalid override value
    throw new Error(
      'BITBUCKET_CLOUD_AUTH_METHOD contains an unknown value. Allowed: api, oauth, user.',
    );
  }

  // No explicit method requested and no env override. Choose by precedence
  // (username/password -> API token -> OAuth) but don't error if multiple are set.
  const count = Number(!!api) + Number(!!oauth) + Number(!!user);
  if (count === 0) {
    throw new Error(
      'No Bitbucket Cloud authentication found. Please set one of: BITBUCKET_CLOUD_API_TOKEN, BITBUCKET_CLOUD_OAUTH_TOKEN, or BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD.',
    );
  }

  if (count > 1) {
    debug(
      'Multiple Bitbucket Cloud auth env vars detected; using precedence user -> API -> OAuth. To select a specific method, call getBitbucketCloudAuth(method) or set BITBUCKET_CLOUD_AUTH_METHOD.',
    );
  }

  // Prefer username+appPassword when available because some Bitbucket
  // API endpoints (workspace/repo listing and file listing) require Basic
  // auth using an app password. Falling back to token-based auth is still
  // supported but is lower precedence.
  if (user) {
    return {
      type: 'user',
      username: user.username,
      appPassword: user.password,
      password: user.password,
    };
  }
  if (api) return { type: 'api', token: api };
  // oauth must be present here
  return { type: 'oauth', token: oauth! };
}
