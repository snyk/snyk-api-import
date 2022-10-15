import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { UPDATED_PROJECTS_LOG_NAME } from './../common';
import { Project } from './../lib/types';
import { getLoggingPath } from './../lib';

const debug = debugLib('snyk:sync-org-projects');

export interface FailedProject extends Project {
  locationUrl: string;
}

export async function logUpdatedProjects(
  orgId: string,
  branchesUpdated: string[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = bunyan.createLogger({
      name: 'snyk:sync-org-projects',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: `${loggingPath}/${orgId}.${UPDATED_PROJECTS_LOG_NAME}`,
        },
      ],
    });
    branchesUpdated.forEach((projectPublicId) => {
      debug({ orgId, projectPublicId }, 'Error importing project');
      log.info({ orgId, projectPublicId }, 'Default branch updated');
    });
  } catch (e) {
    // do nothing
  }
}
