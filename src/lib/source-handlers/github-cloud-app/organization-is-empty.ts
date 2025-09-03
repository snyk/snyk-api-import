import { createGitHubAppClient } from './get-github-app-token';

/**
 * Checks if an organization has any accessible repositories for the GitHub App
 */
export async function githubCloudAppOrganizationIsEmpty(
  orgName: string,
): Promise<boolean> {
  try {
    const octokit = await createGitHubAppClient();

    // Get the first page of repositories to check if any exist
    const response = await octokit.repos.listForOrg({
      org: orgName,
      type: 'all',
      per_page: 1, // We only need to check if at least one exists
      page: 1,
    });

    // If we get any repositories, the organization is not empty
    return response.data.length === 0;
  } catch (error) {
    if (error instanceof Error) {
      // If we get a 404 or 403, it might mean the app doesn't have access
      // or the organization doesn't exist, which we consider as "empty"
      if (error.message.includes('404') || error.message.includes('403')) {
        return true;
      }

      throw new Error(
        `Failed to check if organization '${orgName}' is empty: ${error.message}`,
      );
    }
    throw error;
  }
}
