import * as debugLib from 'debug';
import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import * as fs from 'fs';
import { getLoggingPath } from '../lib';

import { UPDATED_BATCHES_LOG_NAME } from '../common';
import { streamData } from '../stream-data';
import bunyan = require('bunyan');
import { UpdateOrgs } from '../lib/api/update';

const debug = debugLib('snyk:update-projects-script');

export async function updateOrgs(
  fileName: string,
  loggingPath: string = getLoggingPath(),
): Promise<{
  numberOfOrgsUpdated: number;
  logFile: string | undefined;
}> {
  const OrgsFilePath = path.resolve(process.cwd(), loggingPath, fileName);
  if (!fs.existsSync(OrgsFilePath)) {
    throw new Error(`File can not be found at location ${OrgsFilePath}`);
  }

  let orgs: string[] = [];
  try {
    orgs = await streamData<string>(fileName, 'orgs') ?? [];
  } catch (e) {
    throw new Error(`Failed to parse targets from ${fileName}:\n${e.message}`);
  }
  console.log(
    `Loaded ${orgs.length} target(s) to import | ${new Date(
      Date.now(),
    ).toUTCString()}`,
  );

  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
    period: 1000,
    maxRetryCount: 3,
  });
  
  let logFile 
  const concurrentOrgs = getConcurrentUpdateNumber()
  let numberOfOrgsUpdated = 0

  for (
    let orgIndex = 0;
    orgIndex < orgs.length;
    orgIndex = orgIndex + concurrentOrgs
  ) {
    const batch = orgs.slice(
      orgIndex,
      orgIndex + concurrentOrgs,
    );
    const currentOrgs = orgIndex + 1;
    const fullOrgsNumber = orgs.length;
    let currentBatchEnd = currentOrgs + concurrentOrgs - 1;
    if (currentBatchEnd > fullOrgsNumber) {
      currentBatchEnd = currentOrgs;
    }
    const batchProgressMessages = `Importing batch ${currentOrgs} - ${currentBatchEnd} out of ${fullOrgsNumber}`;
    logFile = await logUpdatedBatch(batchProgressMessages);
    await UpdateOrgs(
      requestManager,
      batch,
    );
    numberOfOrgsUpdated += currentOrgs 
  }
  return { numberOfOrgsUpdated, logFile };
}

export function getConcurrentUpdateNumber(): number {
  let UpdateNumber = parseInt(process.env.CONCURRENT_UPDATE || '15');
  if (UpdateNumber > 50) {
    // never more than 50!
    UpdateNumber = 50;
  }
  return UpdateNumber;
}

async function logUpdatedBatch(
  message: string,
  loggingPath: string = getLoggingPath(),
): Promise<string| undefined> {
  try {
    const fileName = `${loggingPath}/${UPDATED_BATCHES_LOG_NAME}`
    const log = bunyan.createLogger({
      name: 'snyk:update-projects-script',
      level: 'info',
      streams: [
        {
          level: 'info',
          path: fileName,
        },
      ],
    });
    debug({ message }, 'Kicked off update');
    log.info({ message }, 'Kicked off update');
    
    return fileName
  } catch (e) {
    // do nothing
  }
}