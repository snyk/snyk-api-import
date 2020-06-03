import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';
import { FAILED_POLLS_LOG_NAME } from './common';

export async function logFailedPollUrls(
  locationUrl: string,
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = `${locationUrl}:${message},`;
    const orgId = locationUrl.split('/').slice(-5)[0];
    fs.appendFileSync(`${loggingPath}/${orgId}.${FAILED_POLLS_LOG_NAME}`, log);
  } catch (e) {
    // do nothing
  }
}
