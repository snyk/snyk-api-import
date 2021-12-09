export function getBaseUrl(host?: string): string {
  return host ? host : 'https://dev.azure.com';
}
