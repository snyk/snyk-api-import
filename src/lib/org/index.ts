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
