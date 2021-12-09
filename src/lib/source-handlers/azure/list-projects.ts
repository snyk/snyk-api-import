import * as qs from 'querystring';
import base64 = require('base-64');
import Bottleneck from 'bottleneck';
import * as needle from 'needle';
import * as debugLib from 'debug';
import { AzureProjectData } from './types';
import { getAzureToken } from './get-azure-token';
import { getBaseUrl } from './get-base-url';
import { AzureProjectData as Project } from './types';

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

async function fetchAllProjects(
  orgName: string,
  host: string,
): Promise<Project[]> {
  const projectList: Project[] = [];
  let hasMorePages = true;
  let displayPageNumber = 1;
  let nextPage: string | undefined;
  while (hasMorePages) {
    debug(`Fetching page ${displayPageNumber} for Azure projects`);
    const { projects, continueFrom } = await getProjects(
      orgName,
      host,
      nextPage,
    );
    if (continueFrom && projects.length > 0) {
      nextPage = continueFrom;
      displayPageNumber++;
    } else {
      hasMorePages = false;
    }
    projects.map((project) => {
      const { name, id } = project;
      if (name && id) {
        projectList.push({ id, name });
      }
    });
  }
  return projectList;
}

async function getProjects(
  orgName: string,
  host: string,
  continueFrom?: string,
): Promise<{
  projects: Project[];
  continueFrom?: string;
}> {
  const azureToken = getAzureToken();
  const params = {
    stateFilter: 'wellFormed',
    continuationToken: continueFrom,
    'api-version': '4.1',
  };
  const query = qs.stringify(params);
  const data = await limiter.schedule(() =>
    needle(
      'get',
      `${host}/${orgName}/_apis/projects?${query}`, //document the version somewhere
      {
        headers: { Authorization: 'Basic ' + base64.encode(':' + azureToken) },
      },
    ),
  );
  if (data.statusCode != 200) {
    throw new Error(`Failed to fetch page: ${host}\n${data.body}`);
  }
  const { value: projects } = data.body;
  return {
    projects,
    continueFrom: data.headers['x-ms-continuationtoken'] as string,
  };
}

export async function listAzureProjects(
  azureOrgName: string,
  host: string,
): Promise<AzureProjectData[]> {
  debug(`Fetching all projects data for org: ${azureOrgName}`);
  const baseUrl = getBaseUrl(host);
  const projects = await fetchAllProjects(azureOrgName, baseUrl);
  return projects;
}
