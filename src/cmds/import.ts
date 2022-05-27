import * as debugLib from 'debug';
import * as _ from 'lodash';
import * as yargs from 'yargs';
import { CommandResult } from '../lib/types';

const debug = debugLib('snyk:import-projects-script');

import { importProjects } from '../scripts/import-projects';
import { getImportProjectsFile } from '../lib';
import { getLoggingPath } from '../lib';

export const command = ['import', '$0'];
export const desc = 'Kick off API powered import';
export const builder = {
  file: {
    required: false,
    default: undefined,
    desc: 'Path to json file that contains the targets to be imported',
  },
};

export const aliases = ['i'];

export async function importFunction(file: string) : Promise<CommandResult> {

  try {
    
    const logsPath = getLoggingPath();
    const importFile = getImportProjectsFile(file);

    const {
      projects,
      filteredTargets,
      targets,
      skippedTargets,
      logFile,
    } = await importProjects(importFile);

    const projectsMessage =
      projects.length > 0
        ? `Imported ${_.uniqBy(projects, 'projectUrl').length} project(s)`
        : '⚠ No projects imported!';

    const targetsMessage = `\nProcessed ${
      filteredTargets.length
    } out of a total of ${targets.length} targets${
      skippedTargets
        ? ` (${skippedTargets} were skipped as they have been previously imported).`
        : ''
    }`;

    const message = `${projectsMessage}${targetsMessage}\nCheck the logs for any failures located at:  ${logsPath}/*`
      
    return {
      fileName: logFile,
      exitCode: 0,
      message: message,
    };

  } catch (e) {
    const errorMessage = `ERROR! Failed to kick off import with error: ${e.message}\n Try running with \`DEBUG=snyk* snyk-import\` for more information`;

    return {
      fileName: undefined,
      exitCode: 1,
      message: errorMessage,
    };
  }

}

export async function handler(argv: { file: string }): Promise<void> {

    const { file } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));
    
    const res = await importFunction(file);

    if (res.exitCode === 1) {
      debug('Failed to create organizations.\n' + res.message);
  
      console.error(res.message);
      yargs.exit(1, new Error(res.message))
    } else {
      console.log(res.message);
    }
  
}
