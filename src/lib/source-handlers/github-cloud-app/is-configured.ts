/**
 * Checks if GitHub Cloud App is properly configured
 * Validates that all required environment variables are set
 */
export function isGitHubCloudAppConfigured(): boolean {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  // Check if required environment variables are set
  if (!appId || !privateKey) {
    return false;
  }

  // Basic validation of the private key format
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    return false;
  }

  // Basic validation of the app ID format
  if (!/^\d+$/.test(appId)) {
    return false;
  }

  return true;
}

/**
 * Gets a human-readable error message for configuration issues
 */
export function getGitHubCloudAppConfigurationError(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId) {
    return 'GITHUB_APP_ID environment variable is not set. Please set it to your GitHub App ID.';
  }

  if (!privateKey) {
    return 'GITHUB_APP_PRIVATE_KEY environment variable is not set. Please set it to your GitHub App private key (PEM format).';
  }

  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    return 'GITHUB_APP_PRIVATE_KEY must be in PEM format. Please ensure it starts with "-----BEGIN" and ends with "-----END".';
  }

  if (!/^\d+$/.test(appId)) {
    return 'GITHUB_APP_ID must be a numeric string. Please check your GitHub App ID.';
  }

  return 'GitHub Cloud App configuration appears to be invalid.';
}
