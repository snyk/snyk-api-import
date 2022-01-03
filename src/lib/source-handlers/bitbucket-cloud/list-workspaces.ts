import * as needle from 'needle';
import * as debugLib from 'debug';
import Bottleneck from 'bottleneck';
import base64 = require('base-64');
import { BitbucketCloudWorkspaceData } from './types';
import { getBitbucketCloudUsername } from './get-bitbucket-cloud-username';
import { getBitbucketCloudPassword } from './get-bitbucket-cloud-password';

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

export async function fetchAllWorkspaces(
  username: string,
  password: string,
): Promise<BitbucketCloudWorkspaceData[]> {
  let isLastPage = false;
  let workspaces: BitbucketCloudWorkspaceData[] = [];
  let pageCount = 1;
  while (!isLastPage) {
    debug(`Fetching page ${pageCount}\n`);
    const { statusCode, body } = await limiter.schedule(() =>
      needle('get', `https://bitbucket.org/api/2.0/workspaces`, {
        headers: {
          Authorization: 'Basic ' + base64.encode(username + ':' + password),
        },
      }),
    );
    if (statusCode != 200) {
      if (statusCode == 429) {
        debug(
          `Failed to fetch page: https://bitbucket.org/api/2.0/workspaces\n, Response Status: ${body}\nToo many requests \nWaiting for 3 minutes before resuming`,
        );
        await sleepNow(180000);
        isLastPage = false;
      } else {
        debug(
          `Failed to fetch page: https://bitbucket.org/api/2.0/workspaces\n, Response Status: ${statusCode}\nResponse Status Text: ${body} `,
        );
      }
    }
    const apiResponse = body['values'];
    workspaces = workspaces.concat(apiResponse);
    const next = body['next'];
    next ? (isLastPage = false) : (isLastPage = true);
    pageCount++;
  }
  return workspaces;
}

const sleepNow = (delay: number): unknown =>
  new Promise((resolve) => setTimeout(resolve, delay));

export async function listBitbucketCloudWorkspaces(): Promise<
  BitbucketCloudWorkspaceData[]
> {
  const bitbucketCloudUsername = getBitbucketCloudUsername();
  const bitbucketCloudPassword = getBitbucketCloudPassword();
  debug(`Fetching all projects data`);
  const workspaces = await fetchAllWorkspaces(
    bitbucketCloudUsername,
    bitbucketCloudPassword,
  );
  return workspaces;
}
