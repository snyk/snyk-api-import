import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { getGithubBaseUrl } from './github-base-url';

import debugModule from 'debug';
import { fetchReposForPage } from './list-repos';
import { getGithubToken } from './get-github-token';

const debug = debugModule('snyk:github');
const githubClient = Octokit.plugin(retry as any);

export async function githubOrganizationIsEmpty(
  orgName: string,
  host?: string,
): Promise<boolean> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new githubClient({ baseUrl, auth: githubToken });
  debug(`Fetching 1 page of repos data for org: ${orgName}`);
  const perPage = 1;
  const { repos } = await fetchReposForPage(
    octokit,
    orgName,
    undefined,
    perPage,
  );
  if (!repos || repos.length === 0) {
    return true;
  }
  return false;
}
