export function getGithubBaseUrl(host?: string): string {
  return host ? new URL('/api/v3', host).toString() : 'https://api.github.com';
}
