import 'source-map-support/register';
import * as debugLib from 'debug';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { requestsManager } from 'snyk-request-manager';

const debug = debugLib('snyk:api-group');

export interface CreatedOrgResponse {
  id: string;
  name: string;
  created: string;
}
export async function createOrg(
  requestManager: requestsManager,
  groupId: string,
  name: string,
  sourceOrgId?: string,
): Promise<CreatedOrgResponse> {
  getApiToken();
  getSnykHost();
  debug(`Creating a new org: "${name}"`);

  if (!groupId || !name) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: groupId, name.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/0/organizations-in-groups/create-a-new-organization-in-the-group`,
    );
  }
  const body: {
    name: string;
    sourceOrgId?: string;
  } = {
    name,
    sourceOrgId,
  };
  const res = await requestManager.request({
    verb: 'post',
    url: `/group/${groupId}/org`,
    body: JSON.stringify(body),
  });
  if (res.statusCode && res.statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' + JSON.stringify(res),
    );
  }
  return res.data;
}
