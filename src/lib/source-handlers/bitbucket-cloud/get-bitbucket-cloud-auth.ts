export type BitbucketCloudAuthMethod =
  | { type: 'api'; token: string }
  | { type: 'oauth'; token: string }
  | { type: 'user'; username: string; appPassword: string; password?: string };

export function getBitbucketCloudAuth(): BitbucketCloudAuthMethod {
  const apiToken = process.env.BITBUCKET_CLOUD_API_TOKEN;
  if (apiToken) {
    return { type: 'api', token: apiToken };
  }
  const oauthToken = process.env.BITBUCKET_CLOUD_OAUTH_TOKEN;
  if (oauthToken) {
    return { type: 'oauth', token: oauthToken };
  }
  const username = process.env.BITBUCKET_CLOUD_USERNAME;
  const password = process.env.BITBUCKET_CLOUD_PASSWORD;
  if (username && password) {
    // map existing BITBUCKET_CLOUD_PASSWORD env var to appPassword property
    // include `password` for backward compatibility with callers that expect that field
    return { type: 'user', username, appPassword: password, password };
  }
  throw new Error(
    'No Bitbucket Cloud authentication found. Please set BITBUCKET_CLOUD_API_TOKEN, BITBUCKET_CLOUD_OAUTH_TOKEN, or BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD.'
  );
}