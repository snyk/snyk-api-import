import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { Target } from './../lib/types';
import { getLoggingPath } from './../lib/get-logging-path';
import { IMPORT_LOG_NAME } from './../common';
import { generateTargetId } from '../generate-target-id';

const debug = debugLib('snyk:import-projects-script');

export async function logImportedTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  locationUrl: string,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = bunyan.createLogger({
      name: 'snyk:import-projects-script',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: `${loggingPath}/${IMPORT_LOG_NAME}`,
        },
      ],
    });
    debug(
      {
        target,
        locationUrl,
        orgId,
        integrationId,
        targetId: generateTargetId(orgId, integrationId, target),
      },
      'Target requested for import',
    );
    log.info(
      {
        target,
        locationUrl,
        orgId,
        integrationId,
        targetId: generateTargetId(orgId, integrationId, target),
      },
      'Target requested for import',
    );
  } catch (e) {
    // do nothing
  }
}
