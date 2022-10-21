import 'source-map-support/register';
import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as qs from 'querystring';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import type {
  SnykProject,
  RESTTargetResponse,
  RESTProjectData,
  SnykTarget,
} from '../../types';

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

export interface ProjectsResponse {
  org: {
    id: string;
  };
  projects: SnykProject[];
}

interface RESTProjectsResponse {
  data: RESTProjectData[];
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
  name?: string; // If supplied, only projects that have a name that starts with this value will be returned
  origin?: string; //If supplied, only projects that exactly match this origin will be returned
  type?: string; //If supplied, only projects that exactly match this type will be returned
  isMonitored?: boolean; // If set to true, only include projects which are monitored, if set to false, only include projects which are not monitored
  targetId?: string; // The target ID to be used in sunc functions
}

export async function listProjects(
  requestManager: requestsManager,
  orgId: string,
  filters?: ProjectsFilters,
): Promise<ProjectsResponse> {
  getApiToken();
  getSnykHost();
  debug(`Listing all projects for org: ${orgId} with filter ${JSON.stringify(filters)}`);
  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, settings.
        \nFor more information see: https://snyk.docs.apiary.io/#reference/projects/all-projects/list-all-projects`,
    );
  }

  const projects = await listAllProjects(requestManager, orgId, filters);

  const snykProjectData: ProjectsResponse = {
    org: {
      id: orgId,
    },
    projects: projects,
  };

  return snykProjectData;
}

async function listAllProjects(
  requestManager: requestsManager,
  orgId: string,
  filters?: ProjectsFilters,
): Promise<SnykProject[]> {
  let lastPage = false;
  const projectsList: SnykProject[] = [];
  let pageCount = 1;
  let nextPageLink: string | undefined = undefined;
  while (!lastPage) {
    try {
      debug(
        `Fetching page ${pageCount} to list all projects for org ${orgId}\n`,
      );
      const {
        projects,
        next,
      }: {
        projects: SnykProject[];
        next?: string;
      } = await getProject(requestManager, orgId, filters, nextPageLink);

      projectsList.push(...projects);
      next
        ? ((lastPage = false), (nextPageLink = next))
        : ((lastPage = true), (nextPageLink = ''));
      pageCount++;
    } catch (e) {
      debug('Failed to update notification settings for ', orgId, e);
      throw e;
    }
  }
  return projectsList;
}

async function getProject(
  requestManager: requestsManager,
  orgId: string,
  filters?: ProjectsFilters,
  nextPageLink?: string,
): Promise<{ projects: SnykProject[]; next?: string }> {

  const query = qs.stringify({
    version: '2022-09-15~beta',
    ...filters,
  });

  const url = nextPageLink ?? `/orgs/${orgId.trim()}/projects?${query}`;

  const res = await requestManager.request({
    verb: 'get',
    url: url,
    useRESTApi: true,
  });

  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' +
        JSON.stringify({ data: res.data, status: statusCode }),
    );
  }

  const response = res.data as RESTProjectsResponse;

  const projects = convertToSnykProject(response.data);
  const next = response.links.next;

  return { projects, next };
}

function convertToSnykProject(projectData: RESTProjectData[]): SnykProject[] {
  const projects: SnykProject[] = [];

  for (const project of projectData) {
    const projectTmp: SnykProject = {
      id: project.id,
      branch: project.attributes.targetReference,
      created: project.attributes.created,
      origin: project.attributes.origin,
      name: project.attributes.name,
      type: project.attributes.type,
    };
    projects.push(projectTmp);
  }

  return projects;
}
export interface TargetFilters {
  remoteUrl?: string;
  limit?: number;
  isPrivate?: boolean;
  origin?: string;
  displayName?: string;
  excludeEmpty?: boolean;
}
export async function listTargets(
  requestManager: requestsManager,
  orgId: string,
  config?: TargetFilters,
): Promise<{ targets: SnykTarget[] }> {
  getApiToken();
  getSnykHost();
  debug(`Listing all targets for org: ${orgId}`);

  if (!orgId && orgId.length > 0) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, settings.
        \nFor more information see: https://apidocs.snyk.io/?version=2022-09-15%7Ebeta#get-/orgs/-org_id-/targets`,
    );
  }

  const targets = await listAllSnykTargets(requestManager, orgId, config);

  return { targets };
}

export async function listAllSnykTargets(
  requestManager: requestsManager,
  orgId: string,
  config?: TargetFilters,
): Promise<SnykTarget[]> {
  let lastPage = false;
  const targetsList: SnykTarget[] = [];
  let pageCount = 1;
  let nextPageLink: string | undefined = undefined;
  while (!lastPage) {
    try {
      debug(`Fetching page ${pageCount} of get target for ${orgId}\n`);
      const {
        targets,
        next,
      }: { targets: SnykTarget[]; next?: string } = await getSnykTarget(
        requestManager,
        orgId,
        nextPageLink,
        config,
      );

      targetsList.push(...targets);
      next
        ? ((lastPage = false), (nextPageLink = next))
        : ((lastPage = true), (nextPageLink = undefined));
      pageCount++;
    } catch (e) {
      debug('Failed to get targets for ', orgId, e);
      throw e;
    }
  }
  return targetsList;
}

export async function getSnykTarget(
  requestManager: requestsManager,
  orgId: string,
  nextPageLink?: string,
  config: {
    limit?: number;
    excludeEmpty?: boolean;
    origin?: string;
  } = {
    limit: 20,
    excludeEmpty: true,
  },
): Promise<{ targets: SnykTarget[]; next?: string }> {
  const query = qs.stringify({
    version: '2022-09-15~beta',
    ...config,
  });
  const url = nextPageLink ?? `/orgs/${orgId.trim()}/targets?${query}`;

  const res = await requestManager.request({
    verb: 'get',
    url: url,
    body: undefined,
    useRESTApi: true,
  });

  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' +
        JSON.stringify({ data: res.data, status: statusCode }),
    );
  }

  const responseData = res.data as RESTTargetResponse;
  const targets = responseData.data;
  const { next } = responseData.links;

  return { targets, next };
}
