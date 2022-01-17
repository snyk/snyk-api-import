import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import * as pMap from 'p-map';
import * as fs from 'fs';
import split = require('split');
import {
  importTargets,
  pollImportUrls,
  getConcurrentImportsNumber,
} from '../lib';
import { Project, ImportTarget } from '../lib/types';
import { getLoggingPath } from '../lib';
import { logImportedBatch } from '../loggers/log-imported-batch';
import { IMPORT_LOG_NAME } from '../common';
import { generateTargetId } from '../generate-target-id';
import { streamData } from '../stream-data';

const debug = debugLib('snyk:import-projects-script');
const debugSkipTargets = debugLib('skipping-targets');


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

export async function filterOutImportedTargets(
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
  debugSkipTargets(`Checking if any targets should be skipped`);
  await pMap(
    targets,
    async (targetItem) => {
      const shouldSkip = await shouldSkipTarget(targetItem, importedTargets);
      if (shouldSkip) {
        debugSkipTargets('Skipping target', JSON.stringify(targetItem));
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
  const targetsFilePath = path.resolve(process.cwd(), loggingPath, fileName);
  if (!fs.existsSync(targetsFilePath)) {
    throw new Error(`File can not be found at location ${targetsFilePath}`);
  }

  let targets: ImportTarget[] = [];
  try {
    targets = await streamData<ImportTarget>(fileName, 'targets') ?? [];
  } catch (e) {
    throw new Error(`Failed to parse targets from ${fileName}:\n${e.message}`);
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
    period: 1000,
    maxRetryCount: 3,
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
    debug(`Received ${pollingUrlsAndContext.length} polling URLs`);
    const res = await pollImportUrls(requestManager, pollingUrlsAndContext);
    debug(`Finished polling, discovered ${res.projects?.length} projects`);
    projects.push(...res.projects);
  }
  return { projects, skippedTargets, filteredTargets, targets };
}
