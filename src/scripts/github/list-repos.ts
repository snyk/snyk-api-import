import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';

import { getGithubBaseUrl } from './github-base-url';

const debug = debugLib('snyk:list-repos-script');

export interface GithubRepoData {
  fork: boolean;
  branch: string;
  owner: string;
  name: string;
}

async function fetchReposForPage(
  octokit: Octokit,
  orgName: string,
  pageNumber = 1,
): Promise<{
  repos: GithubRepoData[];
  hasNextPage: boolean;
}> {
  const repoData: GithubRepoData[] = [];
  const params = {
    per_page: 100,
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
          owner: repo?.owner?.login as string,
          branch: repo.default_branch as string,
        })),
    );
  } else {
    hasNextPage = false;
  }
  return { repos: repoData, hasNextPage};
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
    currentPage = currentPage + 1;
    debug(`Fetching page: ${currentPage}`)
    const { repos, hasNextPage } = await fetchReposForPage(octokit, orgName, currentPage);
    hasMorePages = hasNextPage;
    repoData.push(...repos);
  }
  return repoData;
}

export async function listGithubRepos(
  orgName: string,
  host?: string,
): Promise<GithubRepoData[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      `Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'`,
    );
  }
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
  debug(`Fetching all repos data for org: ${orgName}`)
  const repos = await fetchAllRepos(octokit, orgName);

  return repos;
}
