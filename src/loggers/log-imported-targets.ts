import * as bunyan from 'bunyan';
import * as debugLib from 'debug';
import * as _ from 'lodash';

import { Target } from './../lib/types';
import { IMPORT_LOG_NAME, targetProps } from './../common';
import { getLoggingPath } from './../lib';
import { generateTargetId } from '../generate-target-id';

const debug = debugLib('snyk:import-projects-script');

export async function logImportedTarget(
  orgId: string,
  integrationId: string,
  target: Target,
  locationUrl: string | null,
  loggingPath: string = getLoggingPath(),
  message = 'Target requested for import',
): Promise<void> {
  try {
    // only properties available on Target allowed here, must keep them in sync
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
    log.info(
      {
        target: _.pick(target, ...targetProps),
        locationUrl,
        orgId,
        integrationId,
        targetId: generateTargetId(orgId, integrationId, target),
      },
      message,
    );
  } catch (e) {
    // do nothing
  }
}
