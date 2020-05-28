import 'source-map-support/register';
import * as needle from 'needle';
import * as debugLib from 'debug';
import { getApiToken } from '../get-api-token';
import { getSnykHost } from '../get-snyk-host';

const debug = debugLib('snyk:api-group');

export interface CreatedOrgResponse {
  id: string;
  name: string;
  created: string;
}
export async function createOrg(
  groupId: string,
  name: string,
  sourceOrgId?: string,
): Promise<CreatedOrgResponse> {
  const apiToken = getApiToken();
  debug('Creating a new org:' + name);

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
  const SNYK_HOST = getSnykHost();

  const res = await needle(
    'post',
    `${SNYK_HOST}/api/v1/group/${groupId}/org`,
    body,
    {
      json: true,
      // eslint-disable-next-line @typescript-eslint/camelcase
      read_timeout: 30000,
      headers: {
        Authorization: `token ${apiToken}`,
      },
    },
  );
  if (res.statusCode && res.statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' + JSON.stringify(res.body),
    );
  }
  return res.body;
}
