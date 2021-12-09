import { AzureRepoData } from './types';
import Bottleneck from 'bottleneck';
import base64 = require('base-64');
import * as debugLib from 'debug';
import { getAzureToken } from './get-azure-token';
import * as needle from 'needle';
import { listAzureProjects } from './list-projects';
import { getBaseUrl } from './get-base-url';

const debug = debugLib('snyk:azure');

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 500,
});

limiter.on('failed', async (error, jobInfo) => {
  const id = jobInfo.options.id;
  debug(`Job ${id} failed: ${error}`);
  if (jobInfo.retryCount === 0) {
    // Here we only retry once
    debug(`Retrying job ${id} in 25ms!`);
    return 25;
  }
});

export async function fetchAllRepos(
  url: string,
  orgName: string,
  project: string,
  token: string,
): Promise<AzureRepoData[]> {
  debug('Fetching repos for ' + project);
  const repoList: AzureRepoData[] = [];
  const data = await limiter.schedule(() =>
    needle(
      'get',
      `${url}/${orgName}/` +
        encodeURIComponent(project) +
        '/_apis/git/repositories?api-version=4.1',
      {
        headers: { Authorization: `Basic ${base64.encode(':' + token)}` },
      },
    ),
  );
  if (data.statusCode != 200) {
    new Error(`Failed to fetch page: ${url}\n${data.body}`);
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
