import * as needle from 'needle';
import * as debugLib from 'debug';
import Bottleneck from 'bottleneck';
import { BitbucketServerRepoData } from './types';
import { getBitbucketServerToken } from './get-bitbucket-server-token';

const debug = debugLib('snyk:bitbucket-server');

const limiter = new Bottleneck({
  reservoir: 1000, // initial value
  reservoirRefreshAmount: 1000,
  reservoirRefreshInterval: 3600 * 1000,
  maxConcurrent: 1,
  minTime: 1000,
});

limiter.on('failed', async (error, jobInfo) => {
  const id = jobInfo.options.id;
  console.warn(`Job ${id} failed: ${error}`);
  if (jobInfo.retryCount === 0) {
    // Here we only retry once
    console.log(`Retrying job ${id} in 25ms!`);
    return 25;
  }
});

export const fetchAllRepos = async (
  url: string,
  projectKey: string,
  token: string,
): Promise<BitbucketServerRepoData[]> => {
  let isLastPage = false;
  const repos: BitbucketServerRepoData[] = [];
  let pageCount = 1;
  let start = 0;
  const limit = 100;
  while (!isLastPage) {
    debug(`Fetching page ${pageCount} for ${projectKey}\n`);
    const { body, statusCode } = await limiter.schedule(() =>
      needle(
        'get',
        `${url}/rest/api/1.0/repos?projectname=${projectKey}&state=AVAILABLE&start=${start}&limit=${limit}`,
        {
          headers: { Authorization: 'Bearer ' + token },
        },
      ),
    );
    if (statusCode != 200) {
      if (statusCode == 429) {
        debug(
          `Failed to fetch page: ${url}/rest/api/1.0/repos?projectname=${projectKey}&state=AVAILABLE&start=${start}&limit=${limit}\n, Response Status: ${JSON.stringify(
            body,
          )}\nToo many requests \nWaiting for 3 minutes before resuming`,
        );
        await sleepNow(180000);
        isLastPage = false;
      } else {
        debug(
          `Failed to fetch page: ${url}/rest/api/1.0/repos?projectname=${projectKey}&state=AVAILABLE&start=${start}&limit=${limit}\n, Response Status: ${
            statusCode
          }\nResponse Status Text: ${JSON.stringify(body)} `,
        );
      }
    }
    const apiResponse = body['values'];
    for (const repo of apiResponse) {
      repos.push({ projectKey: repo.project.key, repoSlug: repo.name });
    }
    isLastPage = body['isLastPage'];
    start = body['nextPageStart'] || -1;
    pageCount++;
  }
  return repos;
};

const sleepNow = (delay: number): unknown =>
  new Promise((resolve) => setTimeout(resolve, delay));

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
  const repoList: BitbucketServerRepoData[] = [];
  debug(`Fetching all repos data for org: ${projectName}`);
  repoList.push(
    ...(await fetchAllRepos(host, projectName, bitbucketServerToken)),
  );
  return repoList;
}
