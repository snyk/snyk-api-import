import * as debugLib from 'debug';
import type { OutgoingHttpHeaders } from 'http2';
import type { BitbucketServerProjectData } from './types';
import { getBitbucketServerToken } from './get-bitbucket-server-token';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';
import { limiterForScm } from '../../limiters';

const debug = debugLib('snyk:bitbucket-server');

interface BitbucketProjectsResponse {
  values: BitbucketServerProjectData[];
  nextPageStart: number;
  isLastPage: boolean;
}
const fetchAllProjects = async (
  url: string,
  token: string,
): Promise<BitbucketServerProjectData[]> => {
  let lastPage = false;
  let projectsList: BitbucketServerProjectData[] = [];
  let pageCount = 1;
  let startFrom = 0;
  const limit = 100;
  while (!lastPage) {
    debug(`Fetching page ${pageCount} for projects\n`);
    try {
      const { projects, isLastPage, start } = await getProjects(
        url,
        token,
        startFrom,
        limit,
      );
      lastPage = isLastPage;
      startFrom = start;
      projectsList = projectsList.concat(projects);
      pageCount++;
    } catch (err) {
      throw new Error(JSON.stringify(err));
    }
  }
  return projectsList;
};

const getProjects = async (
  url: string,
  token: string,
  startFrom: number,
  limit: number,
): Promise<{
  projects: BitbucketServerProjectData[];
  isLastPage: boolean;
  start: number;
}> => {
  const headers: OutgoingHttpHeaders = { authorization: `Bearer ${token}` };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  const { body, statusCode } =
    await limiterWithRateLimitRetries<BitbucketProjectsResponse>(
      'get',
      `${url}/rest/api/1.0/projects?start=${startFrom}&limit=${limit}`,
      headers,
      limiter,
      60000,
    );
  if (statusCode != 200) {
    throw new Error(`Failed to fetch projects for ${url}/rest/api/1.0/projects?start=${startFrom}&limit=${limit}\n
    Status Code: ${statusCode}\n
    Response body: ${JSON.stringify(body)}`);
  }
  const { values: projects = [], nextPageStart, isLastPage } = body;
  const start = nextPageStart || -1;
  return { projects, isLastPage, start };
};

export async function listBitbucketServerProjects(
  sourceUrl?: string,
): Promise<BitbucketServerProjectData[]> {
  const bitbucketServerToken = getBitbucketServerToken();
  if (!sourceUrl) {
    throw new Error(
      'Please provide required `sourceUrl` for Bitbucket Server source',
    );
  }
  debug(`Fetching all projects data`);
  const projects = await fetchAllProjects(sourceUrl, bitbucketServerToken);
  return projects;
}
