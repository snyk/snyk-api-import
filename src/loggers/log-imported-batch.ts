import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { getLoggingPath } from './../lib/get-logging-path';
import { IMPORTED_BATCHES_LOG_NAME } from './../common';

const debug = debugLib('snyk:import-projects-script');

export async function logImportedBatch(
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = bunyan.createLogger({
      name: 'snyk:import-projects-script',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: `${loggingPath}/${IMPORTED_BATCHES_LOG_NAME}`,
        },
      ],
    });
    debug({ message }, 'Kicked off import');
    log.info({ message }, 'Kicked off import');
  } catch (e) {
    // do nothing
  }
}
