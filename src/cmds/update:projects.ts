import * as debugLib from 'debug';
import * as _ from 'lodash';
import * as yargs from 'yargs';
import { CommandResult } from '../lib/types';

const debug = debugLib('snyk:update-projects');

import { updateOrgs } from '../scripts/update-projects-of-orgs';
import { getUpdateProjectsFile } from '../lib';
import { getLoggingPath } from '../lib';

export const command = ['updateProjects', '$0'];
export const desc = 'Kick off API powered update';

export const aliases = ['i'];

export async function updateFunction(file: string) : Promise<CommandResult> {

  try {
    
    const logsPath = getLoggingPath();
    const updateFile = getUpdateProjectsFile(file);

    const {
      numberOfOrgsUpdated,
      logFile,
    } = await updateOrgs(updateFile);

    const projectsMessage =
      numberOfOrgsUpdated > 0
        ? `Updated ${numberOfOrgsUpdated} org(s)`
        : '⚠ No projects Updated!';

    const message = `${projectsMessage}\nCheck the logs for any failures located at:  ${logsPath}/*`
      
    return {
      fileName: logFile,
      exitCode: 0,
      message: message,
    };

  } catch (e) {
    const errorMessage = `ERROR! Failed to kick off update with error: ${e.message}\n Try running with \`DEBUG=snyk* snyk-import\` for more information`;

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
    
    const res = await updateFunction(file);

    if (res.exitCode === 1) {
      debug('Failed to import projects.\n' + res.message);
  
      console.error(res.message);
      yargs.exit(1, new Error(res.message))
    } else {
      console.log(res.message);
    }
  
}