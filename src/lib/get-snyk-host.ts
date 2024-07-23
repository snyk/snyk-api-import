export function getSnykHost(): string {
  return process.env.SNYK_API || 'https://api.snyk.io/v1';
}
