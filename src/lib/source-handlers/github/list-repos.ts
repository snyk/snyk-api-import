import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';
import { getGithubToken } from './get-github-token';

import { getGithubBaseUrl } from './github-base-url';
import { GithubRepoData } from './types';

const debug = debugLib('snyk:list-repos-script');

export async function fetchReposForPage(
  octokit: Octokit,
  orgName: string,
  pageNumber = 1,
  perPage = 100,
): Promise<{
  repos: GithubRepoData[];
  hasNextPage: boolean;
}> {
  const repoData: GithubRepoData[] = [];
  const params = {
    // eslint-disable-next-line @typescript-eslint/camelcase
    per_page: perPage,
    page: pageNumber,
    org: orgName,
  };
  const res = await octokit.repos.listForOrg(params);
  const repos = res && res.data;
  let hasNextPage;
  if (repos.length) {
    hasNextPage = true;
    repoData.push(
      ...repos
        .filter((repo) => !repo.archived)
        .map((repo) => ({
          fork: repo.fork,
          name: repo.name,
          owner: repo.owner?.login,
          branch: repo.default_branch,
        })),
    );
  } else {
    hasNextPage = false;
  }
  return { repos: repoData, hasNextPage };
}

async function fetchAllRepos(
  octokit: Octokit,
  orgName: string,
  page = 0,
): Promise<GithubRepoData[]> {
  const repoData: GithubRepoData[] = [];
  let currentPage = page;
  let hasMorePages = true;
  while (hasMorePages) {
    try {
      currentPage = currentPage + 1;
      debug(`Fetching page: ${currentPage}`);
      const { repos, hasNextPage } = await fetchReposForPage(
        octokit,
        orgName,
        currentPage,
      );
      hasMorePages = hasNextPage;
      repoData.push(...repos);
    } catch (e) {
      debug(`Failed to fetch page: ${currentPage}`, e);

      if (e.status === 403) {
        const sleepTime = 120000; // 2 mins
        console.error(`Sleeping for ${sleepTime} ms`);
        await new Promise((r) => setTimeout(r, sleepTime));
        // try the same page again
        currentPage = currentPage - 1;
      } else {
        throw e;
      }
    }
  }
  return repoData;
}

export async function listGithubRepos(
  orgName: string,
  host?: string,
): Promise<GithubRepoData[]> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
  debug(`Fetching all repos data for org: ${orgName}`);
  const repos = await fetchAllRepos(octokit, orgName);

  return repos;
}
