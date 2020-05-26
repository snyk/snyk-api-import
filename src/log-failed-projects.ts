import * as fs from 'fs';
import * as _ from 'lodash';
import { FAILED_PROJECTS_LOG_NAME } from './common';
import { Project } from './lib/types';
import { getLoggingPath } from './lib/get-logging-path';

export async function logFailedProjects(
  locationUrl: string,
  projects: Project[],
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    projects.forEach((project) => {
      const log = `${locationUrl}:${Object.values(_.omit(project)).join(':')},`;
      fs.appendFileSync(`${loggingPath}/${FAILED_PROJECTS_LOG_NAME}`, log);
    });
  } catch (e) {
    // do nothing
  }
}
