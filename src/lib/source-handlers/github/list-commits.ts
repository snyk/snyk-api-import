import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';
import { getGithubToken } from './get-github-token';
import { getGithubBaseUrl } from './github-base-url';
import { Commits } from './types';

const debug = debugLib('snyk:list-commits-script');

async function fetchCommitsForPage(
  octokit: Octokit,
  owner: string,
  repo: string,
  pageNumber = 1,
  perPage = 10,
  path: string,
  since: string,
): Promise<{
  commits: Commits[];
  hasNextPage: boolean;
}> {
  const commitsData: Commits[] = [];
  const params = {
    per_page: perPage,
    page: pageNumber,
    owner: owner,
    repo: repo,
    since: since,
    path: path,
  };
  const res = await octokit.repos.listCommits(params);
  const commits = res && res.data;
  const hasNextPage = commits.length ? true : false;
  commitsData.push(
    ...commits.map((commit) => ({
      sha: commit.sha,
    })),
  );

  return { commits: commitsData, hasNextPage };
}

async function fetchAllCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  since: string,
  page = 1,
): Promise<Commits[]> {
  const commitsData: Commits[] = [];
  const MAX_RETRIES = 3;

  let currentPage = page;
  let hasMorePages = true;
  let retries = 0;
  while (hasMorePages) {
    try {
      debug(`Fetching page: ${currentPage}`);
      const { commits, hasNextPage } = await fetchCommitsForPage(
        octokit,
        owner,
        repo,
        currentPage,
        10,
        path,
        since,
      );
      retries = 0;
      currentPage = currentPage + 1;
      hasMorePages = hasNextPage;
      commitsData.push(...commits);
    } catch (e) {
      debug(`Failed to fetch page: ${currentPage}`, e);
      if ([403, 500, 502].includes(e.status) && retries < MAX_RETRIES) {
        const sleepTime = 120000 * retries; // 2 mins x retry attempt
        retries = retries + 1;
        console.error(`Sleeping for ${sleepTime} ms`);
        await new Promise((r) => setTimeout(r, sleepTime));
      } else {
        throw e;
      }
    }
  }
  return commitsData;
}

export async function listGithubCommits(
  owner: string,
  repo: string,
  path: string,
  since?: string,
  host?: string,
): Promise<Commits[]> {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  const weekFromToday = `${d.getUTCFullYear()}-${d.getMonth() +
    1}-${d.getUTCDate()}T${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}Z`;
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
  debug(`Fetching all commits data for repo: ${repo}`);
  const commits = await fetchAllCommits(octokit, owner, repo, path, since ? since : weekFromToday);

  return commits;
}
