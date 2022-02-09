export function getBitbucketCloudUsername(): string {
  const bitbucketCLoudUsername = process.env.BITBUCKET_CLOUD_USERNAME;
  if (!bitbucketCLoudUsername) {
    throw new Error(
      `Please set the BITBUCKET_CLOUD_USERNAME e.g. export BITBUCKET_CLOUD_USERNAME='myBitbucketCloudUsername'`,
    );
  }
  return bitbucketCLoudUsername;
}
