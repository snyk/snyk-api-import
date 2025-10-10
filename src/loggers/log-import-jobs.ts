import * as bunyan from 'bunyan';
import * as debugLib from 'debug';
import * as fs from 'fs';

import { getLoggingPath } from './../lib';
import { IMPORT_JOBS_LOG_NAME } from './../common';

const debug = debugLib('snyk:import-projects-script');

export async function logImportJobsPerOrg(
  orgId: string,
  pollingUrl: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
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

    const log = bunyan.createLogger({
      name: 'snyk:import-projects-script',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: `${loggingPath}/${orgId}.${IMPORT_JOBS_LOG_NAME}`,
        },
      ],
    });
    debug({ orgId, pollingUrl }, 'Kicked off import');
    log.info({ orgId, pollingUrl }, 'Kicked off import');
  } catch {
    // do nothing
  }
}
