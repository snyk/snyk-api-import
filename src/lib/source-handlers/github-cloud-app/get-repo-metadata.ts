import { createGitHubAppClient } from './get-github-app-token';
import { RepoMetaData } from '../../types';

/**
 * Gets repository metadata for a specific repository
 */
export async function getGitHubCloudAppRepoMetadata(
  owner: string,
  repo: string,
): Promise<RepoMetaData> {
  try {
    const octokit = await createGitHubAppClient();

    const response = await octokit.repos.get({
      owner,
      repo,
    });

    const repoData = response.data;

    return {
      branch: repoData.default_branch,
      cloneUrl: repoData.clone_url,
      sshUrl: repoData.ssh_url,
      archived: repoData.archived,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to get repository metadata for '${owner}/${repo}': ${error.message}. Please ensure the GitHub App has access to this repository.`,
      );
    }
    throw error;
  }
}
