import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { FAILED_PROJECTS_LOG_NAME } from './../common';
import { Project } from './../lib/types';
import { getLoggingPath } from './../lib';

const debug = debugLib('snyk:import-projects-script');

// TODO: convert this but think about easily scannable? we need target! and error
export async function logFailedProjects(
  locationUrl: string,
  projects: Project[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    projects.forEach((project) => {
      const orgId = locationUrl.split('/').slice(-5)[0];
      const log = bunyan.createLogger({
        name: 'snyk:import-projects-script',
        level: 'error',
        streams: [{
          level: 'error',
          path: `${loggingPath}/${orgId}.${FAILED_PROJECTS_LOG_NAME}`,
        }],
      });
      debug({ orgId, locationUrl, ...project }, 'Error importing project')
      log.error({ orgId, locationUrl, ...project }, 'Error importing project');
    });
  } catch (e) {
    // do nothing
  }
}
