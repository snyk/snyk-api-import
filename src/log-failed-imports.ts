import * as fs from 'fs';
import { Target } from './lib/types';
import { getLoggingPath } from './lib/get-logging-path';
import { FAILED_LOG_NAME } from './common';

export async function logFailedImports(
  orgId: string,
  integrationId: string,
  target: Target,
  loggingPath: string = getLoggingPath(),
  locationUrl?: string,
): Promise<void> {
  try {
    const log = `${integrationId}:${Object.values(target).join(
      ':',
    )}:${locationUrl},`;
    fs.appendFileSync(`${loggingPath}/${orgId}.${FAILED_LOG_NAME}`, log);
  } catch (e) {
    // do nothing
  }
}
