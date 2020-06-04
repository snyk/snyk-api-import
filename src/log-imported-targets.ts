import * as fs from 'fs';
import { Target } from './lib/types';
import { getLoggingPath } from './lib/get-logging-path';
import { IMPORT_LOG_NAME } from './common';

export async function logImportedTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  locationUrl: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = `${integrationId}:${Object.values(target).join(':')}:${locationUrl},`;
    fs.appendFileSync(`${loggingPath}/${orgId}.${IMPORT_LOG_NAME}`, log);
  } catch (e) {
    // do nothing
  }
}
