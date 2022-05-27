import { Octokit } from '@octokit/rest';
import * as parseLinkHeader from 'parse-link-header';
import * as debugLib from 'debug';

import { getGithubBaseUrl } from './github-base-url';
import { GithubOrgData, SnykOrgData } from './types';
import { getGithubToken } from './get-github-token';

const debug = debugLib('snyk:github');

async function fetchOrgsForPage(
  octokit: Octokit,
  pageNumber = 1,
  since = 0,
  isGithubEnterprise = false,
): Promise<{
  orgs: GithubOrgData[];
  hasNextPage: boolean;
  since?: number;
}> {
  const orgsData: GithubOrgData[] = [];
  const params = {
    per_page: 100,
    page: pageNumber,
    since,
  };

  const res = isGithubEnterprise
    ? await octokit.orgs.list(params)
    : await octokit.orgs.listForAuthenticatedUser(params);
  const links = parseLinkHeader(res.headers.link as string) || {};
  const orgs = res && res.data;
  if (orgs.length) {
    orgsData.push(
      ...orgs.map((org) => ({
        name: org.login,
        id: org.id,
        url: org.url,
      })),
    );
  }
  return {
    orgs: orgsData,
    hasNextPage: !!links.next,
    since: links.next ? Number(links.next.since) : undefined,
  };
}

async function fetchAllOrgs(
  octokit: Octokit,
  page = 0,
  isGithubEnterprise = false,
): Promise<GithubOrgData[]> {
  const orgsData: GithubOrgData[] = [];
  let currentPage = page;
  let hasMorePages = true;
  let currentSince = 0;
  while (hasMorePages) {
    currentPage = currentPage + 1;
    debug(`Fetching page ${currentPage}`);
    const { orgs, hasNextPage, since } = await fetchOrgsForPage(
      octokit,
      currentPage,
      currentSince,
      isGithubEnterprise,
    );
    orgsData.push(...orgs);
    hasMorePages = hasNextPage;
    if (since) {
      currentSince = since;
    }
  }
  return orgsData;
}

export async function listGithubOrgs(host?: string): Promise<GithubOrgData[]> {
  const githubToken = getGithubToken();
  const baseUrl = getGithubBaseUrl(host);
  const octokit: Octokit = new Octokit({ baseUrl, auth: githubToken });
  debug('Fetching all Github organizations data');
  const orgs = await fetchAllOrgs(octokit, undefined, !!host);
  return orgs;
}

export async function githubEnterpriseOrganizations(
  sourceUrl?: string,
): Promise<SnykOrgData[]> {
  if (!sourceUrl) {
   console.warn(
      'No `sourceUrl` provided for Github Enterprise source, defaulting to https://api.github.com',
    );
  }
  const ghOrgs: GithubOrgData[] = await listGithubOrgs(sourceUrl);
  return ghOrgs;
}

export async function githubOrganizations(): Promise<SnykOrgData[]> {
  const ghOrgs: GithubOrgData[] = await listGithubOrgs();
  return ghOrgs;
}
