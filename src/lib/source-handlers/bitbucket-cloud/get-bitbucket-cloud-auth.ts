export function getBitbucketCloudAuth(): { username: string; password: string } {
  const username = process.env.BITBUCKET_CLOUD_USERNAME;
  const password = process.env.BITBUCKET_CLOUD_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'Please set BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD environment variables.'
    );
  }
  return { username, password };
}