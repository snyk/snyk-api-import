import 'source-map-support/register';
import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import { Org } from '../../types';

const debug = debugLib('snyk:api-orgs');

export async function listAllOrgsTokenBelongsTo(
  requestManager: requestsManager,
): Promise<{ orgs: Org[] }> {
  getApiToken();
  getSnykHost();
  debug('Listing all orgs orgs user belongs to');
  const res = await requestManager.request({
    verb: 'get',
    url: `/orgs`,
    body: JSON.stringify({}),
  });

  if (res.statusCode && res.statusCode !== 204) {
    throw new Error(
      'Expected a 204 response, instead received: ' + JSON.stringify(res.data),
    );
  }
  return res.data;
}
