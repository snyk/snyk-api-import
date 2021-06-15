import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import * as pMap from 'p-map';
import * as fs from 'fs';
import split = require('split');

import { loadFile } from '../load-file';
import {
  importTargets,
  pollImportUrls,
  getConcurrentImportsNumber,
} from '../lib';
import { Project, ImportTarget } from '../lib/types';
import { getLoggingPath } from '../lib';
import { IMPORT_LOG_NAME } from '../common';
import { generateTargetId } from '../generate-target-id';

const debug = debugLib('snyk:import-projects-script');

export async function parseLogIntoTargetIds(
  logFile: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const importedTargets: string[] = [];
    fs.createReadStream(logFile)
      .pipe(split())
      .on('data', (lineObj) => {
        if (!lineObj) {
          return;
        }
        try {
          const data = JSON.parse(lineObj);
          const { orgId, integrationId, target } = data;
          importedTargets.push(generateTargetId(orgId, integrationId, target));
        } catch (e) {
          console.log(e);
        }
      })
      .on('error', (err) => {
        console.error('Failed to createReadStream for file: ' + err);
        return reject(err);
      })
      .on('end', async () => {
        return resolve(importedTargets);
      });
  });
}

export async function shouldSkipTarget(
  targetItem: ImportTarget,
  importedTargets: string[],
): Promise<boolean> {
  try {
    const { orgId, integrationId, target } = targetItem;
    const targetId = generateTargetId(orgId, integrationId, target);
    return importedTargets.includes(targetId);
  } catch (e) {
    debug(
      `Failed to process target ${JSON.stringify(targetItem)}. ERROR: ${e}`,
    );
    return false;
  }
}

async function filterOutImportedTargets(
  targets: ImportTarget[],
  loggingPath: string,
): Promise<ImportTarget[]> {
  const filterOutImportedTargets: ImportTarget[] = [];
  let importedTargets: string[] = [];
  try {
    const importedTargetsFilePath = path.resolve(
      process.cwd(),
      loggingPath,
      IMPORT_LOG_NAME,
    );
    if (!fs.existsSync(importedTargetsFilePath)) {
      throw new Error(`File not found ${importedTargetsFilePath}`);
    }
    importedTargets = await parseLogIntoTargetIds(importedTargetsFilePath);
  } catch (e) {
    console.log(
      `Could not load previously imported targets file: ${IMPORT_LOG_NAME}.\nThis could be because it doesn't exist or it is malformed. Either way continuing without checking for previously imported targets.`,
    );
    return targets;
  }
  const totalTargets = targets.length;
  await pMap(
    targets,
    async (targetItem, index) => {
      debug(`Checking target should be skipped: ${index}/${totalTargets}`);
      const shouldSkip = await shouldSkipTarget(targetItem, importedTargets);
      if (shouldSkip) {
        debug('Skipping target', JSON.stringify(targetItem));
      } else {
        filterOutImportedTargets.push(targetItem);
      }
    },
    { concurrency: 150 },
  );

  return filterOutImportedTargets;
}

export async function importProjects(
  fileName: string,
  loggingPath: string = getLoggingPath(),
): Promise<{
  projects: Project[];
  skippedTargets: number;
  filteredTargets: ImportTarget[];
  targets: ImportTarget[];
}> {
  const content = await loadFile(fileName);
  const targets: ImportTarget[] = [];
  try {
    targets.push(...JSON.parse(content).targets);
  } catch (e) {
    throw new Error(`Failed to parse targets from ${fileName}`);
  }
  console.log(
    `Loaded ${targets.length} target(s) to import | ${new Date(
      Date.now(),
    ).toUTCString()}`,
  );
  const concurrentTargets = getConcurrentImportsNumber();
  const projects: Project[] = [];
  console.log(
    `Filtering out previously imported targets, this might be slow | ${new Date(
      Date.now(),
    ).toUTCString()}`,
  );
  const filteredTargets = await filterOutImportedTargets(targets, loggingPath);
  const skippedTargets = targets.length - filteredTargets.length;

  if (skippedTargets > 0) {
    console.warn(
      `Skipped previously imported ${skippedTargets}/${
        targets.length
      } target(s) | ${new Date(Date.now()).toUTCString()}`,
    );
  }

  if (filteredTargets.length === 0) {
    return { projects: [], targets, filteredTargets, skippedTargets: 0 };
  }
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
  });
  for (
    let targetIndex = 0;
    targetIndex < filteredTargets.length;
    targetIndex = targetIndex + concurrentTargets
  ) {
    const pollingUrlsAndContext = await importTargets(
      requestManager,
      targets,
      loggingPath,
    );
    const res = await pollImportUrls(requestManager, pollingUrlsAndContext);
    projects.push(...res.projects);
  }
  return { projects, skippedTargets, filteredTargets, targets };
}