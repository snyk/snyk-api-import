export function getBitbucketCloudPassword(): string {
  const bitbucketCloudPassword = process.env.BITBUCKET_CLOUD_PASSWORD;
  if (!bitbucketCloudPassword) {
    throw new Error(
      `Please set the BITBUCKET_CLOUD_PASSWORD e.g. export BITBUCKET_CLOUD_PASSWORD='mybitbucketCloudPassword'`,
    );
  }
  return bitbucketCloudPassword;
}
