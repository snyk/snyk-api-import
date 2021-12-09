import 'source-map-support/register';
import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { SnykProject } from '../../types';

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
    name: string;
    id: string;
  };
  projects: SnykProject[];
}

export async function listProjects(
  requestManager: requestsManager,
  orgId: string,
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

  const filters = {};
  try {
    const res = await requestManager.request({
      verb: 'post',
      url: `/org/${orgId.trim()}/projects`,
      body: JSON.stringify(filters),
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
