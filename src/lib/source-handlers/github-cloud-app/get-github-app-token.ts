import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import type { GitHubAppConfig } from './types';

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Securely retrieves GitHub App configuration from environment variables
 * with proper validation and error handling
 */
function getGitHubAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId) {
    throw new Error(
      'GITHUB_APP_ID environment variable is required. Please set it to your GitHub App ID.',
    );
  }

  if (!privateKey) {
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY environment variable is required. Please set it to your GitHub App private key (PEM format).',
    );
  }

  // Validate that the private key looks like a PEM key
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY must be in PEM format. Please ensure it starts with "-----BEGIN" and ends with "-----END".',
    );
  }

  // Validate app ID is numeric
  if (!/^\d+$/.test(appId)) {
    throw new Error(
      'GITHUB_APP_ID must be a numeric string. Please check your GitHub App ID.',
    );
  }

  return {
    appId,
    privateKey,
    installationId,
  };
}

/**
 * Creates a GitHub App authentication instance
 */
function createGitHubAppAuth(): any {
  const config = getGitHubAppConfig();

  const authConfig: any = {
    appId: config.appId,
    privateKey: config.privateKey,
  };

  // Only add installationId if it's provided
  if (config.installationId) {
    authConfig.installationId = config.installationId;
  }

  return createAppAuth(authConfig);
}

/**
 * Gets a valid installation token for GitHub App authentication
 * Implements token caching to avoid unnecessary API calls
 */
export async function getGitHubAppToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const auth = createGitHubAppAuth();
    const config = getGitHubAppConfig();

    // If installationId is provided, use it; otherwise let the app discover installations
    const authOptions: any = { type: 'installation' };
    if (config.installationId) {
      authOptions.installationId = config.installationId;
    }

    const { token } = await auth(authOptions);

    // Cache the token with a 50-minute expiry (tokens are valid for 1 hour)
    cachedToken = token;
    tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 minutes in milliseconds

    return token;
  } catch (error) {
    // Clear cached token on error
    cachedToken = null;
    tokenExpiry = null;

    if (error instanceof Error) {
      throw new Error(
        `Failed to authenticate with GitHub App: ${error.message}. Please check your GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and ensure the app is installed on the target organization.`,
      );
    }
    throw error;
  }
}

/**
 * Creates an authenticated Octokit client for GitHub App
 */
export async function createGitHubAppClient(): Promise<Octokit> {
  const token = await getGitHubAppToken();

  return new Octokit({
    auth: token,
    userAgent: 'snyk-api-import',
  });
}

/**
 * Creates an authenticated Octokit client for GitHub App (app-level, not installation-level)
 * Used for listing installations
 */
export async function createGitHubAppClientForApp(): Promise<Octokit> {
  const config = getGitHubAppConfig();
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
  });

  const { token } = await auth({ type: 'app' });
  return new Octokit({
    auth: token,
    userAgent: 'snyk-api-import',
  });
}

/**
 * Clears the cached token (useful for testing or when switching configurations)
 */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = null;
}
