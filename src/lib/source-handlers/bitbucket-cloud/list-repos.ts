import * as needle from 'needle';
import * as debugLib from 'debug';
import Bottleneck from 'bottleneck';
import base64 = require('base-64');
import { BitbucketCloudRepoData } from './types';

const debug = debugLib('snyk:bitbucket-cloud');

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
  workspace: string,
  username: string,
  password: string,
): Promise<BitbucketCloudRepoData[]> => {
  let isLastPage = false;
  let repos: BitbucketCloudRepoData[] = [];
  let pageCount = 1;
  while (!isLastPage) {
    debug(`Fetching page ${pageCount} for ${workspace}\n`);
    const { statusCode, body } = await limiter.schedule(() =>
      needle('get', `https://bitbucket.org/api/2.0/repositories/${workspace}`, {
        headers: {
          Authorization: 'Basic ' + base64.encode(username + ':' + password),
        },
      }),
    );
    if (statusCode != 200) {
      if (statusCode == 429) {
        debug(
          `Failed to fetch page: https://bitbucket.org/api/2.0/repositories/${workspace}\n, Response Status: ${body}\nToo many requests \nWaiting for 3 minutes before resuming`,
        );
        await sleepNow(180000);
        isLastPage = false;
      } else {
        debug(
          `Failed to fetch page: https://bitbucket.org/api/2.0/repositories/${workspace}\n, Response Status: ${statusCode}\nResponse Status Text: ${body} `,
        );
      }
    }
    const apiResponse = body['values'];
    repos = repos.concat(apiResponse);
    const next = body['next'];
    next ? (isLastPage = false) : (isLastPage = true);
    pageCount++;
  }
  return repos;
};

const sleepNow = (delay: number): unknown =>
  new Promise((resolve) => setTimeout(resolve, delay));
