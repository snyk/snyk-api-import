import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { getLoggingPath } from './../lib/get-logging-path';
import { Project } from './../lib/types';
import { IMPORTED_PROJECTS_LOG_NAME } from './../common';

const debug = debugLib('snyk:import-projects-script');

export async function logImportedProjects(
  locationUrl: string,
  projects: Project[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    projects.forEach((project) => {
      const projectId = project.projectUrl.split('/').slice(-1)[0];
      const orgId = locationUrl.split('/').slice(-5)[0];
      const log = bunyan.createLogger({
        name: 'snyk:import-projects-script',
        level: 'info',
        streams: [
          {
            level: 'info',
            path: `${loggingPath}/${orgId}.${IMPORTED_PROJECTS_LOG_NAME}`,
          },
        ],
      });
      debug(
        { orgId, locationUrl, projectId, ...project },
        'Imported project',
      );
      log.info(
        { orgId, locationUrl, projectId, ...project },
        'Imported project',
      );
    });
  } catch (e) {
    // do nothing
  }
}
