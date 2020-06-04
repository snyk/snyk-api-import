import * as fs from 'fs';
import { getLoggingPath } from './lib/get-logging-path';
import { Project } from './lib/types';
import { IMPORTED_PROJECTS_LOG_NAME } from './common';

export async function logImportedProjects(
  pollingUrl: string,
  projects: Project[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  const projectIds: string[] = [];
  try {
    projects.forEach((project) => {
      const projectId = project.projectUrl.split('/').slice(-1)[0];
      projectIds.push(projectId);
    });
    const orgId = pollingUrl.split('/').slice(-5)[0];
    fs.appendFileSync(`${loggingPath}/${orgId}.${IMPORTED_PROJECTS_LOG_NAME}`, `,${projectIds.join(',')}`);
  } catch (e) {
    // do nothing
  }
}
