import * as fs from 'fs';
import { Target } from './lib/types';
import { getLoggingPath } from './lib/get-logging-path';
import { FAILED_LOG_NAME } from './common';

export function logFailedImports(
  orgId: string,
  integrationId: string,
  target: Target,
  loggingPath: string = getLoggingPath(),
  locationUrl?: string,
): void {
  try {
    const log = `${orgId}:${integrationId}:${Object.values(target).join(
      ':',
    )}:${locationUrl},`;
    fs.appendFileSync(`${loggingPath}/${FAILED_LOG_NAME}`, log);
  } catch (e) {
    // do nothing
  }
}
