import { Gitlab } from '@gitbeaker/node';
import * as debugLib from 'debug';
import { getToken } from './get-token';

import { getBaseUrl } from './get-base-url';
import * as types from '@gitbeaker/core/dist/types';
import { GitlabRepoData } from './types';

const debug = debugLib('snyk:list-repos-script');

export async function fetchGitlabReposForPage(
  client: types.Gitlab,
  groupName: string,
  pageNumber = 1,
  perPage = 100,
): Promise<{
  repos: GitlabRepoData[];
  hasNextPage: boolean;
}> {
  const repoData: GitlabRepoData[] = [];
  const params = {
    // eslint-disable-next-line @typescript-eslint/camelcase
    perPage,
    page: pageNumber,
  };
  const projects = await client.Groups.projects(groupName, params);
  let hasNextPage;
  if (projects.length) {
    hasNextPage = true;
    repoData.push(
      ...projects
        .filter(
          (project: any) =>
            !project.archived && project.shared_with_groups?.length == 0,
        )
        .map((project: any) => ({
          fork: !!project.forked_from_project,
          name: project.path_with_namespace,
          id: project.id,
          branch: project.default_branch,
        })),
    );
  } else {
    hasNextPage = false;
  }
  return { repos: repoData, hasNextPage };
}

async function fetchAllRepos(
  client: types.Gitlab,
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
  debug(`Fetching all repos data for org \`${groupName}\` from ${baseUrl}`);
  const repos = await fetchAllRepos(client, groupName);
  return repos;
}
