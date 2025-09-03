import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { createGitHubAppClient } from './get-github-app-token';
import { GitHubCloudAppOrgInfo, GitHubInstallation } from './types';

const githubClient = Octokit.plugin(retry as any);

/**
 * Lists all organizations accessible to the GitHub App
 * Only returns organizations where the app is installed
 */
export async function listGitHubCloudAppOrgs(): Promise<
  GitHubCloudAppOrgInfo[]
> {
  try {
    const octokit = await createGitHubAppClient();

    // Get all installations for this GitHub App
    const installations = await octokit.apps.listInstallations();

    const orgs: GitHubCloudAppOrgInfo[] = [];

    for (const installation of installations.data) {
      // Only include organization installations (not user installations)
      if (
        installation.account?.type === 'Organization' &&
        installation.account.login &&
        installation.account.id &&
        installation.account.url
      ) {
        orgs.push({
          name: installation.account.login,
          id: installation.account.id,
          url: installation.account.url,
        });
      }
    }

    return orgs;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to list GitHub App organizations: ${error.message}. Please ensure the GitHub App is properly configured and has access to organizations.`,
      );
    }
    throw error;
  }
}

/**
 * Gets detailed information about a specific installation
 */
export async function getInstallationDetails(
  installationId: number,
): Promise<GitHubInstallation> {
  try {
    const octokit = await createGitHubAppClient();
    const response = await octokit.apps.getInstallation({
      installation_id: installationId,
    });

    return response.data as GitHubInstallation;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to get installation details for ID ${installationId}: ${error.message}`,
      );
    }
    throw error;
  }
}
