import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { createGitHubAppClient } from './get-github-app-token';
import { GitHubCloudAppRepoData } from './types';

const githubClient = Octokit.plugin(retry as any);

/**
 * Lists all repositories accessible to the GitHub App for a specific organization
 */
export async function listGitHubCloudAppRepos(
  orgName: string,
): Promise<GitHubCloudAppRepoData[]> {
  try {
    const octokit = await createGitHubAppClient();

    const repos: GitHubCloudAppRepoData[] = [];
    let page = 1;
    const perPage = 100; // Maximum allowed by GitHub API

    while (true) {
      const response = await octokit.repos.listForOrg({
        org: orgName,
        type: 'all', // Include both public and private repos
        per_page: perPage,
        page,
        sort: 'updated',
        direction: 'desc',
      });

      if (response.data.length === 0) {
        break;
      }

      for (const repo of response.data) {
        // Skip archived repositories as they're typically not useful for security scanning
        if (!repo.archived) {
          repos.push({
            name: repo.name,
            owner: repo.owner.login,
            fork: repo.fork,
            branch: repo.default_branch,
          });
        }
      }

      // If we got fewer repos than requested, we've reached the end
      if (response.data.length < perPage) {
        break;
      }

      page++;
    }

    return repos;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to list repositories for organization '${orgName}': ${error.message}. Please ensure the GitHub App has access to the organization and its repositories.`,
      );
    }
    throw error;
  }
}

/**
 * Lists repositories for a specific installation ID
 * This is useful when you want to target a specific installation
 */
export async function listReposForInstallation(
  installationId: number,
): Promise<GitHubCloudAppRepoData[]> {
  try {
    const octokit = await createGitHubAppClient();

    const repos: GitHubCloudAppRepoData[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await octokit.apps.listReposAccessibleToInstallation({
        installation_id: installationId,
        per_page: perPage,
        page,
      });

      if (response.data.repositories.length === 0) {
        break;
      }

      for (const repo of response.data.repositories) {
        // Skip archived repositories
        if (!repo.archived) {
          repos.push({
            name: repo.name,
            owner: repo.owner.login,
            fork: repo.fork,
            branch: repo.default_branch,
          });
        }
      }

      // If we got fewer repos than requested, we've reached the end
      if (response.data.repositories.length < perPage) {
        break;
      }

      page++;
    }

    return repos;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to list repositories for installation ID ${installationId}: ${error.message}`,
      );
    }
    throw error;
  }
}
