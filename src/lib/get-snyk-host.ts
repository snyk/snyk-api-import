export function getSnykHost(): string {
  return process.env.SNYK_API || 'https://snyk.io/api/v1';
}
