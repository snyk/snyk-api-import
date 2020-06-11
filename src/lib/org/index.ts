import 'source-map-support/register';
import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import { getApiToken } from '../get-api-token';
import { getSnykHost } from '../get-snyk-host';

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
    url: `/org/${orgId}/integrations`,
    body: JSON.stringify({}),
  });

  if (res.statusCode && res.statusCode !== 201) {
    throw new Error(
      'Expected a 201 response, instead received: ' +
        JSON.stringify(res.data || res.body),
    );
  }
  return res.data || {};
}

const defaultDisabledSettings = {
  'new-issues-remediations': {
    enabled: false,
    issueSeverity: 'high',
    issueType: 'vuln',
  },
  'project-imported': {
    enabled: false,
    issueSeverity: 'high',
    issueType: 'vuln',
  },
  'test-limit': {
    enabled: false,
    issueSeverity: 'high',
    issueType: 'vuln',
  },
  'weekly-report': {
    enabled: false,
    issueSeverity: 'high',
    issueType: 'vuln',
  },
};

export async function setNotificationPreferences(
  requestManager: requestsManager,
  orgId: string,
  settings = defaultDisabledSettings,
): Promise<IntegrationsListResponse> {
  getApiToken();
  getSnykHost();
  debug('Disabling notifications for: ' + orgId);

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId, settings.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/organizations/the-snyk-organization-for-a-request/set-notification-settings`,
    );
  }

  const res = await requestManager.request({
    verb: 'put',
    url: `/org/${orgId}/notification-settings`,
    body: JSON.stringify(settings),
  });

  if (res.statusCode && res.statusCode !== 201) {
    throw new Error(
      'Expected a 201 response, instead received: ' +
        JSON.stringify(res.data || res.body),
    );
  }
  return res.body || {};
}
