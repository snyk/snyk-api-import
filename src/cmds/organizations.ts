import * as debugLib from 'debug';
const debug = debugLib('snyk:import-projects-script');

import { importProjects } from '../scripts/import-projects';
import { getImportConfigFile } from '../lib/get-import-path';
import { getLoggingPath } from '../lib/get-logging-path';
import { createOrgs } from '../scripts/create-orgs';

export const command = ['organizations', '$0'];
export const desc = 'Kick off API powered import';
export const builder = {};
export const aliases = ['i'];

export async function handler(): Promise<void> {
  try {
    const logsPath = getLoggingPath();
    const importFile = getImportConfigFile();
    const createdOrgs = createOrgs(importFile);

    const orgsMessage =
      projects.length > 0
        ? `Imported ${projects.length} project(s)`
        : '⚠ No projects imported!';

    const targetsMessage = `\nProcessed ${filteredTargets.length} out of a total of ${
      targets.length
    } targets${
      skippedTargets
        ? ` (${skippedTargets} were skipped as they have been previously imported).`
        : ''
    }`;

    console.log(
      orgsMessage +
        targetsMessage +
        `\nCheck the logs for any failures located at: ${logsPath}/*`,
    );
  } catch (e) {
    debug('Failed to kick off orgs creation.\n' + e);
    console.error('ERROR! Failed to kick off import. Try running with `DEBUG=snyk* snyk-import`');
  }
}
