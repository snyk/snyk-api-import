export function getApiToken(): string {
  const apiToken = process.env.SNYK_TOKEN;

  if (!apiToken) {
    throw new Error(
      `Please set the SNYK_TOKEN e.g. export SNYK_TOKEN='*****'`,
    );
  }
  return apiToken;
}
