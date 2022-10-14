import 'source-map-support/register';
import * as debugLib from 'debug';
import type { requestsManager } from 'snyk-request-manager';

const debug = debugLib('snyk:api-import');

export async function requestWithRateLimitHandling(
  requestManager: requestsManager,
  url: string,
  verb: string,
  body = {},
): Promise<any> {
  const maxRetries = 7;
  let attempt = 0;
  let res;
  debug('Requesting import with retry');

  while (attempt < maxRetries) {
    try {
      res = await requestManager.request({
        verb,
        url,
        body: JSON.stringify(body),
      });
      break;
    } catch (e: any) {
      res = e;
      if (e.data.code === 401) {
        console.error(
          `ERROR: ${e.data.message}. Please check the token and try again.`,
        );
        break;
      }
      if ([404, 504].includes(e.data.code)) {
        break;
      }
      attempt += 1;
      debug('Failed:' + JSON.stringify(e));
      if (e.data.code === 429) {
        const sleepTime = 600_000 * attempt; // 10 mins x attempt with a max of ~ 1hr
        console.error(
          `Received a rate limit error, sleeping for ${sleepTime} ms (attempt # ${attempt})`,
        );
        await new Promise((r) => setTimeout(r, sleepTime));
      }
    }
  }

  return res;
}
