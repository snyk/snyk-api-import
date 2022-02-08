import { AzureRepoData } from './types';
import base64 = require('base-64');
import * as debugLib from 'debug';
import { OutgoingHttpHeaders } from 'http2';
import { getAzureToken } from './get-azure-token';
import { listAzureProjects } from './list-projects';
import { getBaseUrl } from './get-base-url';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';
import { limiterForScm } from '../../limiters';

const debug = debugLib('snyk:azure');

export async function fetchAllRepos(
  url: string,
  orgName: string,
  project: string,
  token: string,
): Promise<AzureRepoData[]> {
  debug('Fetching repos for ' + project);
  let repoList: AzureRepoData[] = [];
  try {
    repoList = await getRepos(url, orgName, project, token);
  } catch (err) {
    throw new Error(JSON.stringify(err));
  }
  return repoList;
}

async function getRepos(
  url: string,
  orgName: string,
  project: string,
  token: string,
): Promise<AzureRepoData[]> {
  const repoList: AzureRepoData[] = [];
  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(':' + token)}`,
  };
  const limiter = await limiterForScm(1, 500);
  const data = await limiterWithRateLimitRetries(
    'get',
    `${url}/${orgName}/` +
      encodeURIComponent(project) +
      '/_apis/git/repositories?api-version=4.1',
    headers,
    limiter,
    60000,
  );
  if (data.statusCode != 200) {
    throw new Error(`Failed to fetch repos for ${url}/${orgName}/${encodeURIComponent(
      project,
    )}/_apis/git/repositories?api-version=4.1\n
    Status Code: ${data.statusCode}\n
    Response body: ${JSON.stringify(data.body)}`);
  }
  const repos = data.body['value'];
  repos.map(
    (repo: {
      name: string;
      project: { name: string };
      defaultBranch: string;
    }) => {
      const { name, project, defaultBranch } = repo;
      if (name && project && project.name) {
        repoList.push({
          name,
          owner: project.name,
          branch: defaultBranch || '',
        });
      }
    },
  );
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
      ...(await fetchAllRepos(baseUrl, orgName, project.name, azureToken)),
    );
  }
  return repoList;
}
