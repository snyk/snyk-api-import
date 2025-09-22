// Handles Bitbucket Cloud App OAuth2 token retrieval
import type { BitbucketAppConfig } from './types';
import needle = require('needle');

export async function getBitbucketAppToken(config: BitbucketAppConfig): Promise<string> {
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
