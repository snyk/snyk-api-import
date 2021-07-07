import { Octokit } from '@octokit/rest';
import { getGithubBaseUrl } from './github-base-url';

import * as debugLib from 'debug';
import { fetchReposForPage } from './list-repos';
import { getGithubToken } from './get-github-token';

const debug = debugLib('snyk:github');

export async function githubOrganizationIsEmpty(
  orgName: string,
  host?: string,
): Promise<boolean> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
  debug(`Fetching 1 page of repos data for org: ${orgName}`);
  const perPage = 1;
  const { repos } = await fetchReposForPage(octokit, orgName, undefined, perPage);
  if (!repos || repos.length === 0) {
    return true;
  }
  return false;
}
