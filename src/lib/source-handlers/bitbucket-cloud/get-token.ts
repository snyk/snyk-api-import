// Unified Bitbucket Cloud token retrieval
import type { BitbucketCloudAuthConfig } from './types';
import needle = require('needle');

export async function getBitbucketCloudToken(config: BitbucketCloudAuthConfig): Promise<string> {
  if (config.type === 'user') {
    // Basic Auth: encode username:password
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    // Bitbucket Cloud API uses basic auth for user/password
    // Return the base64 string for use in Authorization header
    return auth;
  } else if (config.type === 'app') {
    // OAuth2: client credentials flow
    const url = 'https://bitbucket.org/site/oauth2/access_token';
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
  }
  throw new Error('Invalid BitbucketCloudAuthConfig type');
}
