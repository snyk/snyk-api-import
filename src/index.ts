#!/usr/bin/env node

import * as debugLib from 'debug';
const debug = debugLib('snyk:import-projects-script');

export * from './lib';
import { ImportProjects } from './scripts/import-projects';
import { getImportProjectsFile } from './lib/get-import-path';

try {
  const importFile = getImportProjectsFile();
  ImportProjects(importFile);
} catch (e) {
  debug('Failed to kick off import.\n' + e);
  console.error('ERROR! Try running with `DEBUG=snyk* snyk-import`')
}
