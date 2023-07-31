import * as debugLib from 'debug';
import { OutgoingHttpHeaders } from 'http2';
import { BitbucketServerRepoData } from './types';
import { getBitbucketServerToken } from './get-bitbucket-server-token';
import { limiterWithRateLimitRetries } from '../../request-with-rate-limit';
import { limiterForScm } from '../../limiters';

const debug = debugLib('snyk:bitbucket-server');
interface BitbucketServeRepoData {
  values: {
    name: string;
    project: {
      key: string;
      name?: string;
    };
  }[];
  isLastPage: boolean;
  nextPageStart: number;
}
export const fetchAllRepos = async (
  url: string,
  projectName: string,
  token: string,
): Promise<BitbucketServerRepoData[]> => {
  let lastPage = false;
  let repoList: BitbucketServerRepoData[] = [];
  let pageCount = 1;
  let startFrom = 0;
  const limit = 100;
  while (!lastPage) {
    debug(`Fetching page ${pageCount} for ${projectName}\n`);
    try {
      const { repos, isLastPage, start } = await getRepos(
        url,
        projectName,
        token,
        startFrom,
        limit,
      );
      repoList = repoList.concat(repos);
      lastPage = isLastPage;
      startFrom = start;
      pageCount++;
    } catch (err) {
      throw new Error(JSON.stringify(err));
    }
  }
  return repoList;
};

const getRepos = async (
  url: string,
  projectName: string,
  token: string,
  startFrom: number,
  limit: number,
): Promise<{
  repos: BitbucketServerRepoData[];
  isLastPage: boolean;
  start: number;
}> => {
  let start = 0;
  const repos: BitbucketServerRepoData[] = [];
  const headers: OutgoingHttpHeaders = { Authorization: `Bearer ${token}` };
  const limiter = await limiterForScm(1, 1000, 1000, 1000, 1000 * 3600);
  const { body, statusCode } =
    await limiterWithRateLimitRetries<BitbucketServeRepoData>(
      'get',
      `${url}/rest/api/1.0/repos?projectname=${projectName}&state=AVAILABLE&start=${startFrom}&limit=${limit}`,
      headers,
      limiter,
      60000,
    );
  if (statusCode != 200) {
    throw new Error(`Failed to fetch repos for ${url}/rest/api/1.0/repos?projectname=${projectName}&state=AVAILABLE&start=${startFrom}&limit=${limit}\n
    Status Code: ${statusCode}\n
    Response body: ${JSON.stringify(body)}`);
  }
  const { values, isLastPage, nextPageStart } = body;
  start = nextPageStart || -1;
  for (const repo of values) {
    if (repo.project.name === projectName) {
      repos.push({ projectKey: repo.project.key, repoSlug: repo.name });
    }
  }
  return { repos, isLastPage, start };
};

export async function listBitbucketServerRepos(
  projectName: string,
  host: string,
): Promise<BitbucketServerRepoData[]> {
  const bitbucketServerToken = getBitbucketServerToken();
  if (!host) {
    throw new Error(
      'Please provide required `sourceUrl` for Bitbucket Server source',
    );
  }
  debug(`Fetching all repos data for org: ${projectName}`);
  const repoList = await fetchAllRepos(host, projectName, bitbucketServerToken);
  return repoList;
}
