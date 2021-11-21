import * as debugLib from 'debug';
import * as bunyan from 'bunyan';

import { getLoggingPath } from '../lib';
import { FAILED_ORG_LOG_NAME } from '../common';

const debug = debugLib('snyk:create-orgs-script');

export async function logFailedOrg(
  groupId: string,
  origName: string,
  errorMessage: string,
  loggingPath = getLoggingPath(),
): Promise<void> {
  const log = bunyan.createLogger({
    name: 'snyk:create-orgs-script',
    level: 'error',
    streams: [
      {
        level: 'error',
        path: `${loggingPath}/${groupId}.${FAILED_ORG_LOG_NAME}`,
      },
    ],
  });

  try {
    log.info({ origName, groupId, errorMessage }, 'Failed to create org');
  } catch (e) {
    debug('Failed to log failed organizations at location: ', e);
    // do nothing
  }
}
