import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';

import { loadFile } from '../load-file';
import { importTargets, pollImportUrls } from '../lib';
import { Project, ImportTarget } from '../lib/types';
import { getLoggingPath } from '../lib/get-logging-path';
import { getConcurrentImportsNumber } from '../lib/get-concurrent-imports-number';
import { logImportedBatch } from '../log-imported-batch';

const debug = debugLib('snyk:import-projects-script');

const regexForTarget = (target: string): RegExp =>
  new RegExp(`(,?)${target}.*,`, 'm');

async function filterOutImportedTargets(
  targets: ImportTarget[],
  loggingPath: string,
): Promise<ImportTarget[]> {
  let logFile: string;
  const filterOutImportedTargets: ImportTarget[] = [];
  try {
    logFile = await loadFile(path.resolve(loggingPath, 'imported-targets.log'));
  } catch (e) {
    return targets;
  }
  targets.forEach((targetItem) => {
    const { orgId, integrationId, target } = targetItem;
    try {
      const data = `${orgId}:${integrationId}:${Object.values(target).join(
        ':',
      )}`;
      const targetRegExp = regexForTarget(data);
      const match = logFile.match(targetRegExp);
      if (!match) {
        filterOutImportedTargets.push(targetItem);
      } else {
        debug(
          'Dropped previously imported target: ',
          JSON.stringify(targetItem),
        );
      }
    } catch (e) {
      debug('failed to process target', JSON.stringify(targetItem));
    }
  });

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
  const dateNow = new Date(Date.now());
  debug(`Loaded ${targets.length} targets to import ${dateNow.toUTCString()}`);
  const concurrentTargets = getConcurrentImportsNumber();
  const projects: Project[] = [];
  const filteredTargets = await filterOutImportedTargets(targets, loggingPath);
  if (filteredTargets.length === 0) {
    return { projects: [], targets, filteredTargets, skippedTargets: 0 };
  }
  const skippedTargets = targets.length - filteredTargets.length;
  if (skippedTargets > 0) {
    debug(
      `Skipped previously imported ${skippedTargets}/${targets.length} targets`,
    );
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
    debug(batchProgressMessages);
    logImportedBatch(batchProgressMessages);
    const pollingUrlsAndContext = await importTargets(requestManager, batch, loggingPath);
    projects.push(...(await pollImportUrls(requestManager, pollingUrlsAndContext)));
  }
  return { projects, skippedTargets, filteredTargets, targets };
}
