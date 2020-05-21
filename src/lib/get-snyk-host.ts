export function getSnykHost(): string {
  return process.env.SNYK_HOST || 'https://snyk.io';
}
