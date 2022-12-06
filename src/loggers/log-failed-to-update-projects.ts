import * as bunyan from 'bunyan';

import { FAILED_UPDATE_PROJECTS_LOG_NAME } from './../common';
import { getLoggingPath } from './../lib';
import type { ProjectUpdateFailure } from '../scripts/sync/sync-projects-per-target';

export async function logFailedToUpdateProjects(
  orgId: string,
  updated: ProjectUpdateFailure[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const log = bunyan.createLogger({
      name: 'snyk:sync-org-projects',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: `${loggingPath}/${orgId}.${FAILED_UPDATE_PROJECTS_LOG_NAME}`,
        },
      ],
    });
    updated.forEach((update) => {
      log.info(
        {
          orgId,
          projectPublicId: update.projectPublicId,
          from: update.from,
          to: update.to,
          update: update.type,
          dryRun: String(update.dryRun),
          target: {
            id: update.target?.id,
            origin: update.target?.attributes.origin,
            displayName: update.target?.attributes.displayName,
            remoteUrl: update.target?.attributes.remoteUrl ?? undefined,
          },
          error: update.errorMessage,
        },
        `Snyk project "${update.type}" update failed`,
      );
    });
  } catch (e) {
    // do nothing
  }
}
