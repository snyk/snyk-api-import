import * as bunyan from 'bunyan';
import * as debugLib from 'debug';
import * as fs from 'fs';

import { getLoggingPath } from './../lib';
import { IMPORTED_BATCHES_LOG_NAME } from './../common';

const debug = debugLib('snyk:import-projects-script');

export async function logImportedBatch(
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<string | undefined> {
  try {
    try {
      if (loggingPath) {
        fs.mkdirSync(loggingPath, { recursive: true } as any);
      } else {
        loggingPath = getLoggingPath();
        fs.mkdirSync(loggingPath, { recursive: true } as any);
      }
    } catch {
      // ignore
    }

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
  } catch {
    // do nothing
  }
}
