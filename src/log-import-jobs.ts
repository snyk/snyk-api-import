import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';

export async function logImportJobsPerOrg(
  orgId: string,
  pollingUrl: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const jobId = pollingUrl.split('/').slice(-1)[0];
    fs.appendFileSync(`${loggingPath}/${orgId}.import-jobs.log`, `${jobId},`);
  } catch (e) {
    // do nothing
  }
}
