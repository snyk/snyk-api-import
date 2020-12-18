import * as debugLib from 'debug';
import * as bunyan from 'bunyan';

import { getLoggingPath } from './lib/get-logging-path';
import { FAILED_ORG_LOG_NAME } from './common';

const debug = debugLib('snyk:create-orgs-script');

export function logFailedOrgs(
  orgs: {
    groupId: string;
    name: string;
    errorMessage: string;
  }[],
  loggingPath = getLoggingPath(),
): void {
  const log = bunyan.createLogger({
    name: 'snyk:create-orgs-script',
    level: 'error',
    streams: [
      {
        level: 'error',
        path: `${loggingPath}/${FAILED_ORG_LOG_NAME}`,
      },
    ],
  });

  orgs.forEach((org) => {
    try {
      const { name, groupId, errorMessage } = org;
      log.error({ name, groupId, errorMessage }, 'Failed to create org');
    } catch (e) {
      debug('Failed to log failed orgs at location: ', e);
      // do nothing
    }
  });
}
