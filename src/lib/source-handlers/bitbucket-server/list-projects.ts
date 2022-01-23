import * as needle from 'needle';
import * as debugLib from 'debug';
import Bottleneck from 'bottleneck';
import { BitbucketServerProjectData } from './types';
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
  debug(`Job ${id} failed: ${error}`);
  if (jobInfo.retryCount === 0) {
    // Here we only retry once
    debug(`Retrying job ${id} in 25ms!`);
    return 25;
  }
});

export async function fetchAllProjects(
  url: string,
  token: string,
): Promise<unknown[]> {
  let isLastPage = false;
  let projects: unknown[] = [];
  let pageCount = 1;
  let start = 0;
  const limit = 100;
  while (!isLastPage) {
    debug(`Fetching page ${pageCount} for projects\n`);
    const { statusCode, body } = await limiter.schedule(() =>
      needle(
        'get',
        `${url}/rest/api/1.0/projects?start=${start}&limit=${limit}`,
        {
          headers: { Authorization: 'Bearer ' + token },
        },
      ),
    );
    if (statusCode != 200) {
      if (statusCode == 429) {
        debug(
          `Failed to fetch page: ${url}\n, Response Status: ${body}\nToo many requests \nWaiting for 3 minutes before resuming`,
        );
        await sleepNow(180000);
        isLastPage = false;
      } else {
        debug(
          `Failed to fetch page: ${url}\n, Response Status: ${statusCode}\nResponse Status Text: ${body} `,
        );
      }
    }
    const apiResponse = body['values'];
    projects = projects.concat(apiResponse);
    isLastPage = body['isLastPage'];
    start = body['nextPageStart'] ? body['nextPageStart'] : -1;
    pageCount++;
  }
  return projects;
}

const sleepNow = (delay: number): unknown =>
  new Promise((resolve) => setTimeout(resolve, delay));

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
  const projects = (await fetchAllProjects(
    sourceUrl,
    bitbucketServerToken,
  )) as BitbucketServerProjectData[];
  return projects;
}
