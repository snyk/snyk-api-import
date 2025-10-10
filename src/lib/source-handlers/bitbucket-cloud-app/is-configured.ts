export function isBitbucketCloudAppConfigured(): boolean {
  return !!(
    process.env.BITBUCKET_APP_CLIENT_ID &&
    process.env.BITBUCKET_APP_CLIENT_SECRET
  );
}
