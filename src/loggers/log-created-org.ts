import * as debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';

import { getLoggingPath } from '../lib';
import { CREATED_ORG_LOG_NAME } from '../common';
import type { CreatedOrgResponse } from '../lib';

const debug = debugLib('snyk:create-orgs-script');

// Store created orgs in memory to write them all at once
const createdOrgsMap: { [groupId: string]: any[] } = {};

export async function logCreatedOrg(
  groupId: string,
  origName: string,
  orgData: CreatedOrgResponse,
  integrationsData: {
    [name: string]: string;
  },
  loggingPath = getLoggingPath(),
): Promise<void> {
  try {
    const integrations = Object.keys(integrationsData).map(
      (i) => `${i}:${integrationsData[i]}`,
    );
    const { id, name, created } = orgData;

    // Add to in-memory collection
    if (!createdOrgsMap[groupId]) {
      createdOrgsMap[groupId] = [];
    }

    createdOrgsMap[groupId].push({
      name: origName,
      id,
      created,
      integrations,
      msg: 'Created org',
      time: new Date().toISOString(),
      v: 0,
    });

    // Write the complete file (overwrite)
    const fileName = `${groupId}.${CREATED_ORG_LOG_NAME}`;
    const filePath = path.join(loggingPath, fileName);
    const content = createdOrgsMap[groupId]
      .map((org) => JSON.stringify(org))
      .join('\n');

    fs.writeFileSync(filePath, content);
  } catch (e) {
    debug(
      'Failed to log created organizations at location: ',
      `${loggingPath}/${groupId}.${CREATED_ORG_LOG_NAME}`,
      e,
    );
    // do nothing
  }
}

// Function to clear the in-memory data for a group (useful for testing or cleanup)
export function clearCreatedOrgsForGroup(groupId: string): void {
  delete createdOrgsMap[groupId];
}
