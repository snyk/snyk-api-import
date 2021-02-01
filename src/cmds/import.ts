import * as debugLib from 'debug';
import * as _ from 'lodash';

const debug = debugLib('snyk:import-projects-script');

import { importProjects } from '../scripts/import-projects';
import { getImportProjectsFile } from '../lib';
import { getLoggingPath } from '../lib';

export const command = ['import', '$0'];
export const desc = 'Kick off API powered import';
export const builder = {};
export const aliases = ['i'];

export async function handler(): Promise<void> {
  try {
    const logsPath = getLoggingPath();
    const importFile = getImportProjectsFile();
    const {
      projects,
      filteredTargets,
      targets,
      skippedTargets,
    } = await importProjects(importFile);
    const projectsMessage =
      projects.length > 0
        ? `Imported ${ _.uniqBy(projects, 'projectUrl').length} project(s)`
        : '⚠ No projects imported!';

    const targetsMessage = `\nProcessed ${filteredTargets.length} out of a total of ${
      targets.length
    } targets${
      skippedTargets
        ? ` (${skippedTargets} were skipped as they have been previously imported).`
        : ''
    }`;

    console.log(
      projectsMessage +
        targetsMessage +
        `\nCheck the logs for any failures located at: ${logsPath}/*`,
    );
  } catch (e) {
    debug('Failed to kick off import.\n' + e);
    console.error('ERROR! Failed to kick off import. Try running with `DEBUG=snyk* snyk-import`');
  }
}
