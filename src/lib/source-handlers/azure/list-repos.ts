import type { AzureRepoData } from './types';
import base64 from 'base-64';
import debugModule from 'debug';
import type { OutgoingHttpHeaders } from 'http2';
import { getAzureToken } from './get-azure-token';
import { listAzureProjects } from './list-projects';
import { getBaseUrl } from './get-base-url';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';
import { limiterForScm } from '../../limiters';

const debug = debugModule('snyk:azure');

interface AzureReposResponse {
  value: {
    name: string;
    project: { name: string };
    defaultBranch: string;
    isDisabled: boolean;
  }[];
}
export async function fetchAllRepos(
  url: string,
  orgName: string,
  project: {
    name: string;
    id: string;
  },
  token: string,
): Promise<AzureRepoData[]> {
  debug('Fetching repos for ' + project.name);
  let repoList: AzureRepoData[] = [];
  try {
    repoList = await getRepos(url, orgName, project.id, token);
  } catch (err) {
    throw new Error(JSON.stringify(err));
  }
  return repoList;
}

async function getRepos(
  url: string,
  orgName: string,
  projectId: string,
  token: string,
): Promise<AzureRepoData[]> {
  const repoList: AzureRepoData[] = [];

  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(':' + token)}`,
  };

  const limiter = await limiterForScm(1, 500);
  const { body, statusCode } =
    await limiterWithRateLimitRetries<AzureReposResponse>(
      'get',
      `${url}/${orgName}/${projectId}/_apis/git/repositories?api-version=4.1`,
      headers,
      limiter,
      60000,
    );
  if (statusCode != 200) {
    throw new Error(`Failed to fetch repos for ${url}/${orgName}/${projectId}/_apis/git/repositories?api-version=4.1\n
    Status Code: ${statusCode}\n
    Response body: ${JSON.stringify(body)}`);
  }
  const { value: repos } = body;
  repos.map(({ name, project, defaultBranch, isDisabled }) => {
    if (name && project && project.name && defaultBranch && !isDisabled) {
      repoList.push({
        name,
        owner: project.name,
        branch: defaultBranch,
      });
    }
  });
  return repoList;
}

export async function listAzureRepos(
  orgName: string,
  host?: string,
): Promise<AzureRepoData[]> {
  const azureToken = getAzureToken();
  const baseUrl = getBaseUrl(host);
  const repoList: AzureRepoData[] = [];
  debug(`Fetching all repos data for org: ${orgName}`);
  const projectList = await listAzureProjects(orgName, baseUrl);
  for (const project of projectList) {
    repoList.push(
      ...(await fetchAllRepos(
        baseUrl,
        orgName,
        { name: project.name, id: project.id },
        azureToken,
      )),
    );
  }
  return repoList;
}
