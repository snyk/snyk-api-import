import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import * as debugLib from 'debug';
import type { Target } from '../../types';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';

const githubClient = Octokit.plugin(retry);
const debug = debugLib('snyk:get-github-defaultBranch-script');

export async function validateToken(
  target: Target,
  host?: string,
): Promise<{ valid: true }> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new githubClient({
    baseUrl,
    auth: githubToken,
  });

  debug(`Fetching organization info to validate token access: ${target.owner}`);

  await octokit.orgs.get({
    org: target.owner!,
  });
  return { valid: true };
}
