import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';
import type { Target } from '../../types';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';

const debug = debugLib('snyk:get-github-defaultBranch-script');

export async function getGithubReposDefaultBranch(
  target: Target,
  host?: string,
): Promise<string> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });

  debug(`Fetch default branch for repo: ${target.owner}/${target.name}`);

  const response = await octokit.repos.get({
    owner: target.owner!,
    repo: target.name!,
  });
  return response.data.default_branch as string;
}
