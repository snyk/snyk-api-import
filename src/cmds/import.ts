import * as debugLib from 'debug';
const debug = debugLib('snyk:import-projects-script');

import { ImportProjects } from '../scripts/import-projects';
import { getImportProjectsFile } from '../lib/get-import-path';
import { getLoggingPath } from '../lib/get-logging-path';

export const command = ['import', '$0'];
export const desc = 'Kick off API powered import';
export const builder = {};
export const aliases = ['i'];

export async function handler(): Promise<void> {
  try {
    getLoggingPath();
    const importFile = getImportProjectsFile();
    ImportProjects(importFile);
  } catch (e) {
    debug('Failed to kick off import.\n' + e);
    console.error('ERROR! Try running with `DEBUG=snyk* snyk-import`');
  }
}
