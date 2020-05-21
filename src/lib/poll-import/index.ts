import 'source-map-support/register';
import * as needle from 'needle';
import * as sleep from 'sleep-promise';
import * as debugLib from 'debug';
import * as _ from 'lodash';
import * as pMap from 'p-map';
import { PollImportResponse } from '../types';
import { getApiToken } from '../get-api-token';
const debug = debugLib('snyk:poll-import');
const MIN_RETRY_WAIT_TIME = 30000;
const MAX_RETRY_COUNT = 1000;

export async function pollImportUrl(
  locationUrl: string,
  retryCount = MAX_RETRY_COUNT,
  retryWaitTime = MIN_RETRY_WAIT_TIME,
): Promise<PollImportResponse> {
  const apiToken = getApiToken();
  debug(`Polling locationUrl=${locationUrl}`);

  if (!locationUrl) {
    throw new Error(
      `Missing required parameters. Please ensure you have provided: location url.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/integrations/import-projects/import`,
    );
  }
  try {
    const res = await needle('get', `${locationUrl}`, {
      json: true,
      // eslint-disable-next-line @typescript-eslint/camelcase
      read_timeout: 30000,
      headers: {
        Authorization: `token ${apiToken}`,
      },
    });
    const importStatus: PollImportResponse = res.body;
    debug(`Import task status is "${importStatus.status}"`);
    if (
      importStatus.status &&
      importStatus.status !== 'complete' &&
      retryCount > 0
    ) {
      await sleep(retryWaitTime);
      const increasedRetryWaitTime =
        retryWaitTime + retryWaitTime * 0.1 * (MAX_RETRY_COUNT - retryCount);
      debug(`Will re-check import task in "${increasedRetryWaitTime}ms"`);
      return await pollImportUrl(
        locationUrl,
        --retryCount,
        increasedRetryWaitTime,
      );
    }
    return res.body;
  } catch (error) {
    debug('Could not complete API import:', error);
    const err: {
      message?: string | undefined;
      innerError?: string;
    } = new Error('Could not complete API import');
    err.innerError = error;
    throw err;
  }
}

export async function pollImportUrls(
  locationUrls: string[],
): Promise<PollImportResponse[]> {
  if (!locationUrls) {
    throw new Error(
      'Missing required parameters. Please ensure you have provided: locationUrls.',
    );
  }
  const uniqueLocationUrls = _.uniq(locationUrls);
  const resArray: PollImportResponse[] = [];
  await pMap(
    uniqueLocationUrls,
    async (locationUrl) => {
      try {
        const res = await pollImportUrl(locationUrl);
        // TODO: log all succeeded into a file
        resArray.push(res);
      } catch (error) {
        // TODO: log all failed into a file
        debug('Failed to poll:', locationUrl);
      }
    },
    { concurrency: 10 },
  );

  return resArray;
}
