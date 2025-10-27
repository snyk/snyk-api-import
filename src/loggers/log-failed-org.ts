import debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';

import { getLoggingPath } from '../lib';
import { FAILED_ORG_LOG_NAME } from '../common';

const debug = debugLib('snyk:create-orgs-script');

// Store failed orgs in memory to write them all at once
const failedOrgsMap: { [groupId: string]: any[] } = {};

export async function logFailedOrg(
  groupId: string,
  origName: string,
  errorMessage: string,
  loggingPath = getLoggingPath(),
): Promise<void> {
  try {
    // Add to in-memory collection
    if (!failedOrgsMap[groupId]) {
      failedOrgsMap[groupId] = [];
    }

    failedOrgsMap[groupId].push({
      origName,
      groupId,
      errorMessage,
      msg: 'Failed to create org',
      time: new Date().toISOString(),
      v: 0,
    });

    // Write the complete file (overwrite)
    const fileName = `${groupId}.${FAILED_ORG_LOG_NAME}`;
    const filePath = path.join(loggingPath, fileName);
    const content = failedOrgsMap[groupId]
      .map((org) => JSON.stringify(org))
      .join('\n');

    fs.writeFileSync(filePath, content);
  } catch (e) {
    debug('Failed to log failed organizations at location: ', e);
    // do nothing
  }
}

// Function to clear the in-memory data for a group (useful for testing or cleanup)
export function clearFailedOrgsForGroup(groupId: string): void {
  delete failedOrgsMap[groupId];
}
