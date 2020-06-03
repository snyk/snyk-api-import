import * as fs from 'fs';
import { Target } from './lib/types';
import { getLoggingPath } from './lib/get-logging-path';

export function logImportedTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  locationUrl: string,
  loggingPath: string = getLoggingPath(),
): void {
  try {
    const log = `${orgId}:${integrationId}:${Object.values(target).join(':')}:${locationUrl},`;
    fs.appendFileSync(`${loggingPath}/imported-targets.log`, log);
  } catch (e) {
    // do nothing
  }
}
