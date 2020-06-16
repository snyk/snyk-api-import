import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';
import { IMPORTED_BATCHES_LOG_NAME } from './common';

export async function logImportedBatch(
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    fs.appendFileSync(`${loggingPath}/${IMPORTED_BATCHES_LOG_NAME}`, `${message}\n`);
  } catch (e) {
    // do nothing
  }
}
