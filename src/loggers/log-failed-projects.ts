import * as bunyan from 'bunyan';
import * as debugLib from 'debug';

import { FAILED_PROJECTS_LOG_NAME } from './../common';
import { Project } from './../lib/types';
import { getLoggingPath } from './../lib';

const debug = debugLib('snyk:import-projects-script');

export async function logFailedProjects(
  locationUrl: string,
  projects: Project[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  const projectsPerOrg: {
    [orgId: string]: {
      projects: Project[];
    };
  } = {};
  try {
    projects.map((project) => {
      const orgId = locationUrl.split('/').slice(-5)[0];
      if (!projectsPerOrg[orgId]) {
        projectsPerOrg[orgId] = {
          projects: [],
        };
      } else {
        projectsPerOrg[orgId].projects.push(project);
      }
    });

    for (const orgId in Object.keys(projectsPerOrg)) {
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
      projectsPerOrg[orgId].projects.forEach((project) => {
        debug({ orgId, locationUrl, ...project }, 'Error importing project');
        log.error(
          { orgId, locationUrl, ...project },
          'Error importing project',
        );
      });
    }
  } catch (e) {
    // do nothing
  }
}
