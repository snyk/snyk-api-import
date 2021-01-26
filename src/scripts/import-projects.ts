import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';

import { loadFile } from '../load-file';
import { importTargets, pollImportUrls } from '../lib';
import { Project, ImportTarget } from '../lib/types';
import { getLoggingPath } from '../lib/get-logging-path';
import { getConcurrentImportsNumber } from '../lib/get-concurrent-imports-number';
import { logImportedBatch } from '../loggers/log-imported-batch';
import { IMPORT_LOG_NAME } from '../common';
import pMap = require('p-map');
import { generateTargetId } from '../generate-target-id';

const debug = debugLib('snyk:import-projects-script');

const regexForTarget = (target: string): RegExp =>
  new RegExp(`(,?)${target}.*,`, 'm');

export async function skipTargetIfFoundInLog(
  targetItem: ImportTarget,
  logFile: string,
): Promise<boolean> {
  const { orgId, integrationId, target } = targetItem;
  try {
    const data = generateTargetId(orgId, integrationId, target);
    const targetRegExp = regexForTarget(data);
    const match = logFile.match(targetRegExp);
    if (!match) {
      return false;
    }
    debug('Dropped previously imported target: ', JSON.stringify(targetItem));
    return true;
  } catch (e) {
    debug('Failed to process target', targetItem);
    return false;
  }
}
async function filterOutImportedTargets(
  targets: ImportTarget[],
  loggingPath: string,
): Promise<ImportTarget[]> {
  let logFile: string;
  const filterOutImportedTargets: ImportTarget[] = [];
  try {
    logFile = await loadFile(path.resolve(loggingPath, IMPORT_LOG_NAME));
  } catch (e) {
    return targets;
  }
  await pMap(
    targets,
    async (targetItem, index) => {
      debug('Checking if target needs skipping: ' + index);
      const foundInLog = await skipTargetIfFoundInLog(targetItem, logFile);
      if (!foundInLog) {
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
    const batch = filteredTargets.slice(
      targetIndex,
      targetIndex + concurrentTargets,
    );
    const currentTargets = skippedTargets + targetIndex + 1;
    const fullTargetsNumber = filteredTargets.length + skippedTargets;
    let currentBatchEnd = currentTargets + concurrentTargets - 1;
    if (currentBatchEnd > fullTargetsNumber) {
      currentBatchEnd = currentTargets;
    }
    const batchProgressMessages = `Importing batch ${currentTargets} - ${currentBatchEnd} out of ${fullTargetsNumber} ${
      skippedTargets > 0 ? `(skipped ${skippedTargets})` : ''
    }`;
    logImportedBatch(batchProgressMessages);
    const pollingUrlsAndContext = await importTargets(
      requestManager,
      batch,
      loggingPath,
    );
    const res = await pollImportUrls(requestManager, pollingUrlsAndContext);
    projects.push(...res.projects);
  }
  return { projects, skippedTargets, filteredTargets, targets };
}
