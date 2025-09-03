import { getGitHubAppToken } from './get-github-app-token';

/**
 * Builds a git clone URL with GitHub App authentication
 * Uses the installation token for authentication
 */
export async function getGitHubCloudAppCloneUrl(
  owner: string,
  repo: string,
): Promise<string> {
  try {
    const token = await getGitHubAppToken();

    // Use HTTPS clone URL with token authentication
    // Format: https://x-access-token:TOKEN@github.com/owner/repo.git
    return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to generate clone URL for '${owner}/${repo}': ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Builds an SSH clone URL (for repositories that support SSH)
 * Note: This doesn't use the GitHub App token as SSH uses key-based auth
 */
export function getGitHubCloudAppSshCloneUrl(
  owner: string,
  repo: string,
): string {
  return `git@github.com:${owner}/${repo}.git`;
}
