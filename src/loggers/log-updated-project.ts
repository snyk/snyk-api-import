import * as bunyan from 'bunyan';
import * as fs from 'fs';

import { UPDATED_PROJECTS_LOG_NAME } from './../common';
import { getLoggingPath } from './../lib';
import type { ProjectUpdate } from '../scripts/sync/sync-projects-per-target';

export async function logUpdatedProjects(
  orgId: string,
  updated: ProjectUpdate[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    try {
      if (loggingPath) {
        fs.mkdirSync(loggingPath, { recursive: true } as any);
      } else {
        loggingPath = getLoggingPath();
        fs.mkdirSync(loggingPath, { recursive: true } as any);
      }
    } catch {
      // ignore
    }

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
        },
        `Snyk project "${update.type}" update completed`,
      );
    });
  } catch {
    // do nothing
  }
}
