// Checks if Bitbucket Cloud App is configured (env vars present)
export function isConfigured(): boolean {
  return !!(process.env.BITBUCKET_APP_CLIENT_ID && process.env.BITBUCKET_APP_CLIENT_SECRET);
}
