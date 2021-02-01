import * as bunyan from 'bunyan';
import { IMPORT_JOB_RESULTS } from './../common';

import { getLoggingPath } from './../lib';
import { PollImportResponse } from './../lib/types';

export async function logJobResult(
  locationUrl: string,
  data: PollImportResponse,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = bunyan.createLogger({
      name: 'snyk:import-projects-script',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: `${loggingPath}/${IMPORT_JOB_RESULTS}`,
        },
      ],
    });
    log.info({ locationUrl, ...data }, 'Import job result');
  } catch (e) {
    // do nothing
  }
}
