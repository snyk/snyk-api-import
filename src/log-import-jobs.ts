import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';
import { IMPORT_JOBS_LOG_NAME } from './common';

export async function logImportJobsPerOrg(
  orgId: string,
  pollingUrl: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    fs.appendFileSync(`${loggingPath}/${orgId}.${IMPORT_JOBS_LOG_NAME}`, `${pollingUrl},`);
  } catch (e) {
    // do nothing
  }
}
