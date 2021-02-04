import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { FAILED_PROJECTS_LOG_NAME } from './../common';
import { Project } from './../lib/types';
import { getLoggingPath } from './../lib';

const debug = debugLib('snyk:import-projects-script');

export interface FailedProject extends Project {
  locationUrl: string;
}

export async function logFailedProjects(
  projects: FailedProject[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const projectsPerOrg: {
      [orgName: string]: Project[];
    } = {};
    projects.forEach((p) => {
      const orgId = p.locationUrl.split('/').slice(-5)[0];
      if (!projectsPerOrg[orgId]) {
        projectsPerOrg[orgId] = [p];
      } else {
        projectsPerOrg[orgId].push(p);
      }
    });

    for (const orgId in projectsPerOrg) {
      const log = bunyan.createLogger({
        name: 'snyk:import-projects-script',
        level: 'error',
        streams: [
          {
            level: 'error',
            path: `${loggingPath}/${orgId}.${FAILED_PROJECTS_LOG_NAME}`,
          },
        ],
      });
      projectsPerOrg[orgId].forEach((project) => {
        debug({ orgId, ...project }, 'Error importing project');
        log.error({ orgId, ...project }, 'Error importing project');
      });
    }
  } catch (e) {
    // do nothing
  }
}
