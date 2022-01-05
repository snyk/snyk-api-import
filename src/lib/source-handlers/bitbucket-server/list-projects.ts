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
  console.warn(`Job ${id} failed: ${error}`);
  if (jobInfo.retryCount === 0) {
    // Here we only retry once
    console.log(`Retrying job ${id} in 25ms!`);
    return 25;
  }
});

export const fetchAllProjects = async (
  url: string,
  token: string,
): Promise<unknown[]> => {
  let isLastPage = false;
  let values: unknown[] = [];
  let pageCount = 1;
  let start = 0;
  const limit = 100;
  while (!isLastPage) {
    debug(`Fetching page ${pageCount} for projects\n`);
    const response = await limiter.schedule(() =>
      needle(
        'get',
        `${url}/rest/api/1.0/projects?start=${start}&limit=${limit}`,
        {
          headers: { Authorization: 'Bearer ' + token },
        },
      ),
    );
    if (response.statusCode != 200) {
      if (response.statusCode == 429) {
        debug(
          `Failed to fetch page: ${url}\n, Response Status: ${response.body}\nToo many requests \nWaiting for 3 minutes before resuming`,
        );
        await sleepNow(180000);
        isLastPage = false;
      } else {
        debug(
          `Failed to fetch page: ${url}\n, Response Status: ${response.statusCode}\nResponse Status Text: ${response.body} `,
        );
      }
    }
    const apiResponse = response.body['values'];
    values = values.concat(apiResponse);
    isLastPage = response.body['isLastPage'];
    start = response.body['nextPageStart'] || -1;
    pageCount++;
  }
  return values;
};

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
