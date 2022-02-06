import * as qs from 'querystring';
import base64 = require('base-64');
import * as debugLib from 'debug';
import { OutgoingHttpHeaders } from 'http2';
import { AzureProjectData } from './types';
import { getAzureToken } from './get-azure-token';
import { getBaseUrl } from './get-base-url';
import { AzureProjectData as Project } from './types';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';
import { limiterForScm } from '../../limiters';

const debug = debugLib('snyk:azure');

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
    try {
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
    } catch (err) {
      throw new Error(JSON.stringify(err));
    }
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
  const headers: OutgoingHttpHeaders = {
    Authorization: `Basic ${base64.encode(':' + azureToken)}`,
  };
  const limiter = await limiterForScm(1, 500);
  const data = await limiterWithRateLimitRetries(
    'get',
    `${host}/${orgName}/_apis/projects?${query}`,
    headers,
    limiter,
    60000,
  );
  if (data.statusCode != 200) {
    throw new Error(`Failed to fetch projects for ${host}/${orgName}/_apis/projects?${query}\n
    Status Code: ${data.statusCode}\n
    Response body: ${JSON.stringify(data.body)}`);
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
