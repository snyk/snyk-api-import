import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { getLoggingPath } from './../lib';
import { IMPORTED_BATCHES_LOG_NAME } from './../common';

const debug = debugLib('snyk:import-projects-script');

export async function logImportedBatch(
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<string | undefined> {
  try {
    const fileName = `${loggingPath}/${IMPORTED_BATCHES_LOG_NAME}`;
    const log = bunyan.createLogger({
      name: 'snyk:import-projects-script',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: fileName,
        },
      ],
    });
    debug({ message }, 'Kicked off import');
    log.info({ message }, 'Kicked off import');

    return fileName;
  } catch (e) {
    // do nothing
  }
}
