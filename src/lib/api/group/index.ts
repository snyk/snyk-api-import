import 'source-map-support/register';
import * as debugLib from 'debug';
import * as qs from 'querystring';
import { getApiToken } from '../../get-api-token';
import { getSnykHost } from '../../get-snyk-host';
import type { requestsManager } from 'snyk-request-manager';
import type { Org } from '../../types';

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
      \nFor more information see: https://docs.snyk.io/scan-with-snyk/snyk-tools/tool-snyk-api-import/creating-organizations-in-snyk#using-the-api`,
    );
  }
  const body: {
    name: string;
    groupId: string;
    sourceOrgId?: string;
  } = {
    name,
    groupId,
    sourceOrgId,
  };
  const res = await requestManager.request({
    verb: 'post',
    // For v1 the OpenAPI spec defines POST /org (singular)
    url: `/org`,
    body: JSON.stringify(body),
  });
  // If v1 doesn't expose the create endpoint (404), try the REST plural path
  // which some deployments may expose under the REST base.
  try {
    const statusCode = res.statusCode || res.status;
    if (!statusCode || statusCode !== 201) {
      throw new Error(
        'Expected a 201 response, instead received: ' +
          JSON.stringify({ data: res.data, status: statusCode }),
      );
    }
    return res.data;
  } catch (e: any) {
    if (e && e.name === 'NotFoundError') {
      debug('v1 create org returned 404; retrying POST /orgs against REST API base');
      const res2 = await requestManager.request({
        verb: 'post',
        url: `/orgs`,
        body: JSON.stringify(body),
        useRESTApi: true,
      });
      const statusCode2 = res2.statusCode || res2.status;
      if (!statusCode2 || statusCode2 !== 201) {
        throw new Error(
          'Expected a 201 response, instead received: ' +
            JSON.stringify({ data: res2.data, status: statusCode2 }),
        );
      }
      return res2.data;
    }
    throw e;
  }
  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 201) {
    throw new Error(
      'Expected a 201 response, instead received: ' +
        JSON.stringify({ data: res.data, status: statusCode }),
    );
  }
  return res.data;
}

export interface ListOrgsResponse {
  id: string;
  name: string;
  url: string;
  orgs: Omit<Org, 'group'>[];
}

export async function listOrgs(
  requestManager: requestsManager,
  groupId: string,
  params: {
    perPage: number;
    page: number;
  },
): Promise<Org[]> {
  if (!groupId) {
    throw new Error('Missing required param groupId');
  }
  const query = qs.stringify(params);

  let res;
  try {
    debug('Requesting group orgs via v1 api');
    res = await requestManager.request({
      verb: 'get',
      // Follow the v1 OpenAPI spec: group resource is singular '/group/{group_id}/orgs'
      url: `/group/${groupId}/orgs?${query}`,
      body: JSON.stringify({}),
      useRESTApi: false,
    });
  } catch (e: any) {
    // If the v1 endpoint is not found, retry against the REST API base (/rest)
    // since some deployments host group endpoints under the REST API.
    if (e && e.name === 'NotFoundError') {
      debug('v1 group orgs returned 404; retrying against REST API base');
      res = await requestManager.request({
        verb: 'get',
        url: `/groups/${groupId}/orgs?${query}`,
        body: JSON.stringify({}),
        useRESTApi: true,
      });
    } else {
      throw e;
    }
  }
  const statusCode = res.statusCode || res.status;
  if (!statusCode || statusCode !== 200) {
    throw new Error(
      'Expected a 200 response, instead received: ' +
        JSON.stringify({ statusCode, data: res.data }),
    );
  }

  const data: ListOrgsResponse = res.data;
  const orgs = data.orgs.map((org) => ({
    ...org,
    group: {
      name: res.data.name,
      url: res.data.url,
      id: res.data.id,
    },
  }));
  return orgs;
}

export async function listOrgsPerPage(
  requestManager: requestsManager,
  groupId: string,
  pageNumber = 1,
  perPage = 100,
): Promise<{
  orgs: Org[];
  hasNextPage: boolean;
}> {
  const data: Org[] = [];
  const params = {
    perPage,
    page: pageNumber,
  };
  const orgs = await listOrgs(requestManager, groupId, params);
  // There is a next page only when the returned page has the maximum number
  // of items (i.e. it's 'full'). If fewer items are returned then we've
  // reached the final page. Previously this used a truthy check which
  // caused an infinite loop when any orgs existed.
  const hasNextPage = orgs.length === perPage;
  data.push(...orgs);
  return { orgs: data, hasNextPage };
}

export async function getAllOrgs(
  requestManager: requestsManager,
  groupId: string,
): Promise<Org[]> {
  const orgData: Org[] = [];
  let currentPage = 0;
  let hasMorePages = true;
  while (hasMorePages) {
    currentPage = currentPage + 1;
    debug(`Fetching page: ${currentPage}`);
    const { orgs, hasNextPage } = await listOrgsPerPage(
      requestManager,
      groupId,
      currentPage,
    );
    hasMorePages = hasNextPage;
    orgData.push(...orgs);
  }
  return orgData;
}
