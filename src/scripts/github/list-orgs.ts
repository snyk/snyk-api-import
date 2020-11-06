import { Octokit } from '@octokit/rest';
import * as debugLib from 'debug';

import { getGithubBaseUrl } from './github-base-url';

const debug = debugLib('snyk:list-orgs-script');

export interface GithubOrgData {
  name: string;
  id: number;
  url: string;
}
async function fetchOrgsForPage(
  octokit: Octokit,
  pageNumber = 1,
): Promise<{
  orgs: GithubOrgData[];
  hasNextPage: boolean;
}> {
  const orgsData: GithubOrgData[] = [];
  const params = {
    per_page: 100,
    page: pageNumber,
  };
  const res = await octokit.orgs.listForAuthenticatedUser(params);
  const orgs = res && res.data;
  let hasNextPage;
  if (orgs.length) {
    hasNextPage = true;
    orgsData.push(
      ...orgs.map((org) => ({
        name: org.login,
        id: org.id,
        url: org.url,
      })),
    );
  } else {
    hasNextPage = false;
  }
  return { orgs: orgsData, hasNextPage };
}

async function fetchAllOrgs(
  octokit: Octokit,
  page = 0,
): Promise<GithubOrgData[]> {
  const orgsData: GithubOrgData[] = [];
  let currentPage = page;
  let hasMorePages = true;
  while (hasMorePages) {
    currentPage = currentPage + 1;
    const { orgs, hasNextPage } = await fetchOrgsForPage(octokit, currentPage);
    orgsData.push(...orgs);
    hasMorePages = hasNextPage;
  }
  return orgsData;
}

export async function listGithubOrgs(host?: string): Promise<GithubOrgData[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      `Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'`,
    );
  }

  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });

  const orgs = await fetchAllOrgs(octokit);

  return orgs;
}
