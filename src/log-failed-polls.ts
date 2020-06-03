import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';
import { FAILED_LOG_NAME } from './common';

export function logFailedPollUrls(
  locationUrl: string,
  message: string,
  loggingPath: string = getLoggingPath(),
): void {
  try {
    const log = `${locationUrl}:${message},`;
    fs.appendFileSync(`${loggingPath}/${FAILED_LOG_NAME}`, log);
  } catch (e) {
    // do nothing
  }
}
