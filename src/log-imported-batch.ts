import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';
import { IMPORTED_BATCHES_LOG_NAME } from './common';

export async function logImportedBatch(
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const dateNow = new Date(Date.now());
    fs.appendFileSync(`${loggingPath}/${IMPORTED_BATCHES_LOG_NAME}`, `${dateNow.toUTCString()} - ${message}\n`);
  } catch (e) {
    // do nothing
  }
}
