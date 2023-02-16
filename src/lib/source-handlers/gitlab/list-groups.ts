import * as debugLib from 'debug';
import { Gitlab } from '@gitbeaker/node';
import * as types from '@gitbeaker/core';

import { getToken } from './get-token';
import { getBaseUrl } from './get-base-url';
import { GitlabGroupData } from './types';
import { getSubGroupFlag } from './get-subgroups-flag';

const debug = debugLib('snyk:github');
const gitlabSubGroupFile = getSubGroupFlag()

async function fetchOrgsForPage(
  client: types.Gitlab,
  pageNumber = 1,
  topLevelGroupsOnly: boolean,
): Promise<{
  orgs: GitlabGroupData[];
  hasNextPage: boolean;
}> {
  if (gitlabSubGroupFile) {
    const orgsData: GitlabGroupData[] = [];
    const params = {
      perPage: 100,
      page: pageNumber,
      top_level_only: true,
    };
    const orgs = await client.Groups.all(params);
    const hasNextPage = orgs.length ? true : false;
    orgsData.push(
      ...orgs.map((org: any) => ({
        name: org.full_path,
        id: org.id,
        url: org.web_url,
      })),
    );

    return {
      orgs: orgsData,
      hasNextPage,
    };
  }
  else {
    const orgsData: GitlabGroupData[] = [];
    const params = {
      perPage: 100,
      page: pageNumber,
    };
    const orgs = await client.Groups.all(params);
    const hasNextPage = orgs.length ? true : false;
    orgsData.push(
      ...orgs.map((org: any) => ({
        name: org.full_path,
        id: org.id,
        url: org.web_url,
      })),
    );

    return {
      orgs: orgsData,
      hasNextPage,
    };
  }
}

async function fetchAllOrgs(
  client: types.Gitlab,
  topLevelGroupsOnly: boolean = false,
  page = 0,
): Promise<GitlabGroupData[]> {
  const orgsData: GitlabGroupData[] = [];
  let currentPage = page;
  let hasMorePages = true;
  while (hasMorePages) {
    currentPage = currentPage + 1;
    debug(`Fetching page ${currentPage}`);
    const { orgs, hasNextPage } = await fetchOrgsForPage(client, currentPage, topLevelGroupsOnly);
    // const { orgs, hasNextPage } = await fetchOrgsForPage(client, currentPage);
    orgsData.push(...orgs);
    hasMorePages = hasNextPage;
  }
  return orgsData;
}

export async function listGitlabGroups(
  host?: string,
  topLevelGroupsOnly?: boolean,
): Promise<GitlabGroupData[]> {
  const token = getToken();
  const baseUrl = getBaseUrl(host);
  const client = new Gitlab({ host: baseUrl, token });
  debug(`Fetching all Gitlab groups data from ${baseUrl}`);
  const page = 0;
  const orgs = await fetchAllOrgs(client, topLevelGroupsOnly);
  // const orgs = await fetchAllOrgs(client);
  return orgs;
}
