import * as fs from 'fs';
import { Target } from './lib/types';
import { getLoggingPath } from './lib/get-logging-path';

export async function logImportedTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  locationUrl: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = `${orgId}:${integrationId}:${Object.values(target).join(':')},`;
    fs.appendFileSync(`${loggingPath}/imported-targets.log`, log);
  } catch (e) {
    // do nothing
  }
}
