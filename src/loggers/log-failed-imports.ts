import * as debugLib from 'debug';
import * as bunyan from 'bunyan';
import * as fs from 'fs';

import type { Target } from './../lib/types';
import { getLoggingPath } from './../lib';
import { FAILED_LOG_NAME } from './../common';

const debug = debugLib('snyk:import-projects-script');

export async function logFailedImports(
  orgId: string,
  integrationId: string,
  target: Target,
  errorData: {
    errorMessage: string;
    [name: string]: string;
  },
  loggingPath: string = getLoggingPath(),
  locationUrl?: string,
): Promise<void> {
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
    level: 'error',
    streams: [
      {
        level: 'error',
        path: `${loggingPath}/${orgId}.${FAILED_LOG_NAME}`,
      },
    ],
  });
  try {
    debug(
      { integrationId, locationUrl, target, errorData: { ...errorData } },
      'Failed to import target',
    );
    log.error(
      { integrationId, locationUrl, target, errorData: { ...errorData } },
      'Failed to import target',
    );
  } catch {
    log.error(
      { integrationId, locationUrl, target, errorData: { ...errorData } },
      'Failed to log failed imports at location',
    );
    debug('Failed to log failed imports at location: ', loggingPath);
    // do nothing
  }
}
