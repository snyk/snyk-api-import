import 'source-map-support/register';
import debugLib from 'debug';
import type { requestsManager } from 'snyk-request-manager';

const debug = debugLib('snyk:api-import');

export async function requestWithRateLimitHandling(
  requestManager: requestsManager,
  url: string,
  verb: string,
  body = {},
  requestOptions?: Record<string, any>,
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
        // allow callers to forward additional request options (e.g. useRESTApi)
        ...(requestOptions || {}),
      });
      break;
    } catch (e: any) {
      res = e;
      // Defensive extraction of status/code since different errors may have
      // different shapes (e.data.code, e.status, e.statusCode, e.response.status)
      const code =
        (e && e.data && e.data.code) ||
        e.status ||
        e.statusCode ||
        (e.response && e.response.status) ||
        undefined;
      const errMsg =
        (e && e.data && e.data.message) ||
        e.message ||
        'Unknown error';

      // Log a sanitized error for diagnostics
      console.error(
        `requestWithRateLimitHandling error (code=${code}): ${errMsg}`,
      );

      if (code === 401) {
        console.error(
          `ERROR: ${errMsg}. Please check the token and try again.`,
        );
        break;
      }
      if ([404, 504, 400].includes(code)) {
        break;
      }
      attempt += 1;
      // Avoid logging full error object which may contain credentials
      debug(`Failed: ${errMsg}`);
      if (code === 429) {
        const sleepTime = 600_000 * attempt; // 10 mins x attempt with a max of ~ 1hr
        console.error(
          `Received a rate limit error, sleeping for ${sleepTime} ms (attempt # ${attempt})`,
        );
        await new Promise((r) => setTimeout(r, sleepTime));
      }
    }
  }

  // If res is an error object (request failed after retries), throw it so
  // callers (importTarget) can handle the original error shape and log
  // useful diagnostics (status, headers, response body, etc.). Returning
  // the error caused callers to treat it as a successful response and
  // produced misleading "Expected a 201 response" errors.
  if (res && (res instanceof Error || res.response)) {
    throw res;
  }

  return res;
}
