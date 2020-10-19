import * as bunyan from 'bunyan';

import { getLoggingPath } from './lib/get-logging-path';
import { FAILED_POLLS_LOG_NAME } from './common';

export async function logFailedPollUrls(
  locationUrl: string,
  errorData: {
    errorMessage: string,
    [name: string]: any;
  },
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const orgId = locationUrl.split('/').slice(-5)[0];
    const log = bunyan.createLogger({
      name: 'snyk:import-projects-script',
      level: 'error',
      streams: [{
        level: 'error',
        path: `${loggingPath}/${orgId}.${FAILED_POLLS_LOG_NAME}`,
      }],
    });
    log.error({ orgId, locationUrl, ...errorData }, 'Failed to poll url');
  } catch (e) {
    // do nothing
  }
}
