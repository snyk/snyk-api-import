import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import {
  createGitHubAppClientForApp,
  createGitHubAppClient,
} from './get-github-app-token';
import { GitHubCloudAppOrgInfo, GitHubInstallation } from './types';

const githubClient = Octokit.plugin(retry as any);

/**
 * Lists all organizations accessible to the GitHub App
 * Only returns organizations where the app is installed AND can access repositories
 */
export async function listGitHubCloudAppOrgs(): Promise<
  GitHubCloudAppOrgInfo[]
> {
  try {
    const octokit = await createGitHubAppClientForApp();

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
        // Verify that the GitHub App can actually access repositories in this organization
        try {
          const installationClient = await createGitHubAppClient();

          // Try to list repositories to verify access
          const reposResponse = await installationClient.repos.listForOrg({
            org: installation.account.login,
            type: 'all',
            per_page: 1, // We only need to check if we can access repos
            page: 1,
          });

          // If we can access repositories, include this organization
          orgs.push({
            name: installation.account.login,
            id: installation.account.id,
            url: installation.account.url,
          });
        } catch (accessError) {
          // If we can't access repositories, skip this organization
          console.warn(
            `Skipping organization '${installation.account.login}' - GitHub App cannot access repositories: ${accessError.message}`,
          );
        }
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
