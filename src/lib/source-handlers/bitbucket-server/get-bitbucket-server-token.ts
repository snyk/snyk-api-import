export function getBitbucketServerToken(): string {
  const bitbucketServerToken = process.env.BITBUCKET_SERVER_TOKEN;
  if (!bitbucketServerToken) {
    throw new Error(
      `Please set the BITBUCKET_SERVER_TOKEN e.g. export BITBUCKET_SERVER_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  return bitbucketServerToken;
}
