import 'source-map-support/register';
import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { SnykProject, v3ProjectData } from '../../types';
import { StringNullableChain } from 'lodash';

const debug = debugLib('snyk:api-group');

export interface IntegrationsListResponse {
  [name: string]: string;
}

export async function listIntegrations(
  requestManager: requestsManager,
  orgId: string,
): Promise<IntegrationsListResponse> {
  getApiToken();
  getSnykHost();
  debug('Listing integrations for org: ' + orgId);

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/integrations/list`,
    );
  }

  const res = await requestManager.request({
    verb: 'get',
    url: `/org/${orgId.trim()}/integrations`,
    body: JSON.stringify({}),
  });

  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' +
        JSON.stringify({ data: res.data || res.body, status: statusCode }),
    );
  }
  return res.data || {};
}

const defaultDisabledSettings = {
  'new-issues-remediations': {
    enabled: false,
    issueType: 'none',
    issueSeverity: 'high',
  },
  'project-imported': {
    enabled: false,
  },
  'test-limit': {
    enabled: false,
  },
  'weekly-report': {
    enabled: false,
  },
};

interface NotificationSettings {
  [name: string]: {
    enabled?: boolean;
    issueSeverity?: string;
    issueType?: string;
  };
}

export async function setNotificationPreferences(
  requestManager: requestsManager,
  orgId: string,
  orgName: string,
  settings: NotificationSettings = defaultDisabledSettings,
): Promise<IntegrationsListResponse> {
  getApiToken();
  getSnykHost();
  debug(`Disabling notifications for org: ${orgName} (${orgId})`);

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, settings.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/organizations/the-snyk-organization-for-a-request/set-notification-settings`,
    );
  }
  try {
    const res = await requestManager.request({
      verb: 'put',
      url: `/org/${orgId.trim()}/notification-settings`,
      body: JSON.stringify(settings),
    });

    const statusCode = res.statusCode || res.status;
    if (!statusCode || statusCode !== 200) {
      throw new Error(
        'Expected a 200 response, instead received: ' +
          JSON.stringify({ data: res.data, status: statusCode }),
      );
    }
    return res.data || {};
  } catch (e) {
    debug('Failed to update notification settings for ', orgId, e);
    throw e;
  }
}

export async function deleteOrg(
  requestManager: requestsManager,
  orgId: string,
): Promise<unknown> {
  getApiToken();
  getSnykHost();
  debug(`Deleting org: "${orgId}"`);

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/organizations/manage-organization/remove-organization`,
    );
  }
  const res = await requestManager.request({
    verb: 'delete',
    url: `/org/${orgId}`,
    body: JSON.stringify({}),
  });
  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 204) {
    throw new Error(
      'Expected a 204 response, instead received: ' +
        JSON.stringify({ data: res.data, status: statusCode }),
    );
  }
  return res.data;
}

interface ProjectsResponse {
  org: {
    id: string;
  };
  projects: SnykProject[];
}


interface v3ProjectsResponse {
  data: v3ProjectData[];
  jsonapi: {
    version: string;
  };
  links: {
    first: string;
    last: string;
    next: string;
    prev: string;
    related: string;
    self: string;
  };
}

interface ProjectsFilters {
  name?: StringNullableChain; // If supplied, only projects that have a name that starts with this value will be returned
  origin?: string; //If supplied, only projects that exactly match this origin will be returned
  type?: string; //If supplied, only projects that exactly match this type will be returned
  isMonitored?: boolean; // If set to true, only include projects which are monitored, if set to false, only include projects which are not monitored
}


export async function listProjects(
  requestManager: requestsManager,
  orgId: string,
  filters?: ProjectsFilters,
): Promise<ProjectsResponse> {
  getApiToken();
  getSnykHost();
  debug(`Listing all projects for org: ${orgId}`);

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, settings.
        \nFor more information see: https://snyk.docs.apiary.io/#reference/projects/all-projects/list-all-projects`,
    );
  }

  const projects = await listAllProjects(requestManager, orgId, filters)
  
  const snykProjectData: ProjectsResponse = {
    org: {
      id: orgId,
    },
    projects: projects
  }

  return snykProjectData;
}

async function listAllProjects(requestManager: requestsManager,
  orgId: string,
  filters?: ProjectsFilters,
  ): Promise<SnykProject[]> {

    let lastPage = false;
    let projectsList: SnykProject[] = [];
    let pageCount = 1;
    let nextPageLink: string | undefined = undefined;
    while (!lastPage) {
      try {
        const {
          projects,
          next,
        }: {
          projects: SnykProject[];
          next?: string;
        } = await getProject(requestManager, orgId, filters, nextPageLink);

        projectsList = projectsList.concat(projects);
        next
          ? ((lastPage = false), (nextPageLink = next))
          : ((lastPage = true), (nextPageLink = ''));
        pageCount++;
      } catch (e) {
        debug('Failed to update notification settings for ', orgId, e);
        throw e;
    }
  }
  return projectsList
}

async function getProject(requestManager: requestsManager,
  orgId: string,
  filters?: ProjectsFilters,
  nextPageLink?: string,
  ): Promise< { projects: SnykProject[], next?: string } > {
  
    const url = nextPageLink ? nextPageLink : `/orgs/${orgId.trim()}/projects?version=2022-06-08~beta`
    const res = await requestManager.request({
    verb: 'get',
    url: url,
    body: JSON.stringify(filters),
    useRESTApi: true,
  });

  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' +
        JSON.stringify({ data: res.data, status: statusCode }),
    );
  }
  
  const v3responseData = res.data as v3ProjectsResponse

  const projects = convertToSnykProject(v3responseData.data)
  const next =  v3responseData.links.next

  return { projects, next}

}

function convertToSnykProject(projectData: v3ProjectData[]) : SnykProject[] {

  const projects: SnykProject[] = [];

  for (const project of projectData) {  
    const projectTmp: SnykProject = {
      id : project.id, 
      branch : project.attributes.targetReference ,
      created : project.attributes.created,
      origin : project.attributes.origin,
      name : project.attributes.name,
      type: project.attributes.type, 
    }
    projects.push(projectTmp)
  }
  
  return projects
}

