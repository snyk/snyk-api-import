// Unified Bitbucket Cloud token retrieval
import type { BitbucketCloudAuthConfig } from './types';
import needle = require('needle');

export async function getBitbucketCloudToken(config: BitbucketCloudAuthConfig): Promise<string> {
  if (config.type === 'user') {
    // Basic Auth: encode username:password
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    return auth;
  } else if (config.type === 'app') {
    // OAuth2: client credentials flow
    const url = 'https://api.bitbucket.org/site/oauth2/access_token';
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const resp = await needle('post', url, 'grant_type=client_credentials', {
      headers: {
        authorization: `Basic ${auth}`,
        contentType: 'application/x-www-form-urlencoded',
      },
    });
    if (resp.statusCode !== 200 || !resp.body.access_token) {
      throw new Error(`Failed to get Bitbucket App token: ${resp.statusCode} ${resp.body?.error}`);
    }
    return resp.body.access_token;
  } else if (config.type === 'api' || config.type === 'oauth') {
    // For API token or OAuth token, just return the token (used as Bearer)
    return config.token;
  }
  throw new Error('Invalid BitbucketCloudAuthConfig type');
}
