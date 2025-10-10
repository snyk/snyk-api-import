import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import * as debugLib from 'debug';
import type { RepoMetaData, Target } from '../../types';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';

const githubClient = Octokit.plugin(retry as any);
const debug = debugLib('snyk:get-github-defaultBranch-script');

export const getGithubRepoMetaData = async (
  target: Target,
  host?: string,
): Promise<RepoMetaData> => {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new githubClient({
    baseUrl,
    auth: githubToken,
  });

  debug(`Fetching default branch for repo: ${target.owner}/${target.name}`);

  const response = await octokit.repos.get({
    owner: target.owner!,
    repo: target.name!,
  });
  return {
    branch: response.data.default_branch!,
    cloneUrl: response.data.clone_url!,
    sshUrl: response.data.ssh_url!,
    archived: response.data.archived!,
  };
};
