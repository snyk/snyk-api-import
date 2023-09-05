import { Gitlab } from '@gitbeaker/node';
import * as debugLib from 'debug';
import { getToken } from './get-token';

import { getBaseUrl } from './get-base-url';
import * as gitBeakerTypes from '@gitbeaker/core';
import { GitlabRepoData } from './types';
import { getSubGroupFlag } from './get-subgroups-flag';

const debug = debugLib('snyk:list-repos-script');
const gitlabSubGroupFile = getSubGroupFlag()

export async function fetchGitlabReposForPage(
  client: gitBeakerTypes.Gitlab,
  groupName: string,
  pageNumber = 1,
  perPage = 100,
): Promise<{
  repos: GitlabRepoData[];
  hasNextPage: boolean;
}> {
  const repoData: GitlabRepoData[] = [];
  const params: gitBeakerTypes.Types.BaseRequestOptions = {
    // eslint-disable-next-line @typescript-eslint/camelcase
    perPage,
    page: pageNumber,
    with_shared: false,
  };

  const projects = (await client.Groups.projects(
    groupName,
    params,
  )) as gitBeakerTypes.Types.ProjectExtendedSchema[];
  const hasNextPage = projects.length < perPage ? false : true;
  debug(`Found ${projects.length} projects in ${groupName}`);

  for (const project of projects) {
    debug(`Here is the project inside of the fetchGitlabReposForPage method: ${JSON.stringify(project)}`);
    const {
      archived,
      namespace,
      default_branch,
      forked_from_project,
      path_with_namespace,
      id,
    } = project;
    if (groupName !== namespace.full_path) {
      debug(
        `Skipping project ${project.name_with_namespace} as it belong to another group`,
      );
      continue;
    }
    if (archived || !default_branch) {
      debug(
        `Skipping project ${project.name_with_namespace} as it is either archived or has no default branch`,
      );
      continue;
    }

    repoData.push({
      fork: forked_from_project ? true : false,
      name: path_with_namespace,
      id,
      branch: default_branch,
    });
  }
  return { repos: repoData, hasNextPage };
}

async function fetchAllRepos(
  client: gitBeakerTypes.Gitlab,
  groupName: string,
  page = 0,
): Promise<GitlabRepoData[]> {
  const repoData: GitlabRepoData[] = [];
  let currentPage = page;
  let hasMorePages = true;
  while (hasMorePages) {
    currentPage = currentPage + 1;
    debug(`Fetching page: ${currentPage}`);
    const { repos, hasNextPage } = await fetchGitlabReposForPage(
      client,
      groupName,
      currentPage,
    );
    hasMorePages = hasNextPage;
    repoData.push(...repos);
  }
  return repoData;
}

export async function listGitlabRepos(
  groupName: string,
  host?: string,
): Promise<GitlabRepoData[]> {
  const token = getToken();
  const baseUrl = getBaseUrl(host);
  const client = new Gitlab({ host: baseUrl, token });
  let repos: GitlabRepoData[] = [];
  let subGroupData: any[] = [];
  let subGroupsCheck = true;

  debug(`Fetching all repos data for org \`${groupName}\` from ${baseUrl}`);
  const repoList = await fetchAllRepos(client, groupName);
  repos.push(...repoList);

  const subgroups: any = await client.Groups.subgroups(groupName);

  if (gitlabSubGroupFile && subgroups.length >= 1) {
    subGroupData = subgroups
    while (subGroupsCheck) {
      subGroupsCheck = false;
      let extraData: any[] = [];
      // let findSubGroup = true;

      for (const subgroup of subGroupData) {
        debug(`Looking for subgroups`)
        const deeperSubGroups: any = await client.Groups.subgroups(subgroup.full_path)
        if (deeperSubGroups.length >= 1) {
          debug(`Found subgroup in ${subgroup.full_path}!`)
          extraData.push(...deeperSubGroups)
          subGroupsCheck = true;
        }
        // debug(`subgroup data ` + JSON.stringify(subgroup))
        const repoLists = await fetchAllRepos(client, subgroup.full_path);
        repos.push(...repoLists);
      }
      subGroupData = extraData;
    }
  }
  return repos;
}