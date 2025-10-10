// Unified Bitbucket Cloud token retrieval
import type { BitbucketCloudAuthConfig } from './types';
// import needle = require('needle');

export async function getBitbucketCloudToken(
  config: BitbucketCloudAuthConfig,
): Promise<string> {
  if (config.type === 'user') {
    // Basic Auth: encode username:password
    const auth = Buffer.from(`${config.username}:${config.password}`).toString(
      'base64',
    );
    return auth;
  } else if (config.type === 'api' || config.type === 'oauth') {
    // For API token or OAuth token, just return the token (used as Bearer)
    return config.token;
  }
  throw new Error('Invalid BitbucketCloudAuthConfig type');
}
