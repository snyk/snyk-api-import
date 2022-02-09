import * as needle from 'needle';
import Bottleneck from 'bottleneck';
import * as debugLib from 'debug';
import { OutgoingHttpHeaders } from 'http2';

const debug = debugLib('snyk:limiter');

export async function limiterWithRateLimitRetries(
  verb: needle.NeedleHttpVerbs,
  url: string,
  headers: OutgoingHttpHeaders,
  limiter: Bottleneck,
  rateLimitSleepTime: number,
): Promise<any> {
  let data;
  const maxRetries = 7;
  let attempt = 0;
  limiter.on('failed', async (error, jobInfo) => {
    const id = jobInfo.options.id;
    debug(`Job ${id} failed: ${error}`);
    if (jobInfo.retryCount === 0) {
      // Here we only retry once
      debug(`Retrying job ${id} in 25ms!`);
      return 25;
    }
  });
  while (attempt < maxRetries) {
    data = await limiter.schedule(() =>
      needle(verb, url, { headers: headers }),
    );
    if ([404, 200].includes(Number(data.statusCode))) {
      break;
    }
    if (data.statusCode === 401) {
      console.error(
        `ERROR: ${JSON.stringify(
          data.body,
        )}. Please check the token and try again.`,
      );
      break;
    }
    if (data.statusCode === 429) {
      const sleepTime = (rateLimitSleepTime || 60000) * attempt; // 10 mins x attempt with a max of ~ 1hr
      console.error(
        `Received a rate limit error, sleeping for ${sleepTime} ms (attempt # ${attempt})`,
      );
      await new Promise((r) => setTimeout(r, sleepTime));
    }
    attempt += 1;
  }
  return data;
}
