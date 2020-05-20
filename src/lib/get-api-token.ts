export function getApiToken(): string {
  const apiToken = process.env.SNYK_API_TOKEN;

  if (!apiToken) {
    throw new Error(
      `Please set the SNYK_API_TOKEN e.g. export SNYK_API_TOKEN='*****'`,
    );
  }
  return apiToken;
}
