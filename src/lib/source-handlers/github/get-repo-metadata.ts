import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';
import type { RepoMetaData, Target } from '../../types';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';

const debug = debugLib('snyk:get-github-defaultBranch-script');

export async function getGithubRepoMetaData(
  target: Target,
  host?: string,
): Promise<RepoMetaData> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });

  debug(`Fetching default branch for repo: ${target.owner}/${target.name}`);

  const response = await octokit.repos.get({
    owner: target.owner!,
    repo: target.name!,
  });
  return {
    branch: response.data.default_branch!,
    cloneUrl: response.data.clone_url!,
    sshUrl: response.data.ssh_url!,
  };
}
