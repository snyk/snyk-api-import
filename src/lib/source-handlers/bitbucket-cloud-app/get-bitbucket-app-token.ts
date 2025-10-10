import * as needle from 'needle';
import type { BitbucketCloudAppConfig } from './types';

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

function getConfig(): BitbucketCloudAppConfig {
  const clientId = process.env.BITBUCKET_APP_CLIENT_ID;
  const clientSecret = process.env.BITBUCKET_APP_CLIENT_SECRET;
  const apiBase =
    process.env.BITBUCKET_APP_API_BASE || 'https://api.bitbucket.org/2.0';

  if (!clientId || !clientSecret) {
    throw new Error(
      'BITBUCKET_APP_CLIENT_ID and BITBUCKET_APP_CLIENT_SECRET environment variables are required for Bitbucket Cloud App authentication.',
    );
  }

  return { clientId, clientSecret, apiBase };
}

export async function getBitbucketAppToken(): Promise<string> {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const cfg = getConfig();

  // Bitbucket OAuth2 token endpoint
  const tokenUrl = 'https://bitbucket.org/site/oauth2/access_token';
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString(
    'base64',
  );

  try {
    const headers: Record<string, string> = {};
    // Bitbucket requires HTTP Basic auth with client_id:client_secret encoded in base64
    headers['authorization'] = `Basic ${auth}`;
    headers['content-type'] = 'application/x-www-form-urlencoded';
    headers['user-agent'] = 'snyk-api-import';

    const res = await needle(
      'post',
      tokenUrl,
      'grant_type=client_credentials',
      { headers },
    );

    if (!res || !res.body || !res.body.access_token) {
      throw new Error(
        `Failed to obtain Bitbucket app token: ${JSON.stringify(
          res && res.body,
        )}`,
      );
    }

    cachedToken = res.body.access_token;
    // Use expires_in when available, else default to 50 minutes
    const expiresIn = res.body.expires_in
      ? Number(res.body.expires_in)
      : 50 * 60;
    tokenExpiry = Date.now() + expiresIn * 1000 - 30 * 1000; // 30s slop

    return cachedToken!;
  } catch (e: any) {
    cachedToken = null;
    tokenExpiry = null;
    throw new Error(
      `Bitbucket app authentication failed: ${e && e.message ? e.message : e}`,
    );
  }
}

export function clearBitbucketAppTokenCache(): void {
  cachedToken = null;
  tokenExpiry = null;
}
