import * as debugLib from 'debug';
import * as bunyan from 'bunyan';

import { getLoggingPath } from '../lib';
import { FAILED_SYNC_LOG_NAME } from '../common';
import type { SnykTarget } from '../lib/types';

const debug = debugLib('snyk:failed-to-sync-orgs');

export async function logFailedSync(
  orgId: string,
  target: SnykTarget,
  errorMessage: string,
  loggingPath = getLoggingPath(),
): Promise<void> {
  const log = bunyan.createLogger({
    name: 'sync',
    level: 'error',
    streams: [
      {
        level: 'error',
        path: `${loggingPath}/${orgId}.${FAILED_SYNC_LOG_NAME}`,
      },
    ],
  });
  try {
    log.error({ orgId, target, errorMessage }, `Failed to sync target`);
  } catch (e) {
    debug('Failed to log failed sync', { orgId, target, errorMessage });
    // do nothing
  }
}
