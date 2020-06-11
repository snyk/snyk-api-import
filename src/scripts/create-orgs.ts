import * as debugLib from 'debug';
import * as fs from 'fs';

import { loadFile } from '../load-file';
import { CreatedOrgResponse, createOrg } from '../lib';
import { getLoggingPath } from '../lib/get-logging-path';
import { listIntegrations, setNotificationPreferences } from '../lib/org';
import { requestsManager } from 'snyk-request-manager';
import { getImportProjectsFile } from '../lib/get-import-path';

const debug = debugLib('snyk:create-orgs-script');

interface CreateOrgData {
  groupId: string;
  name: string;
  sourceOrgId?: string;
  integrations: {
    [name: string]: string;
  };
}

export async function logCreatedOrg(
  groupId: string,
  origName: string,
  orgData: CreatedOrgResponse,
  integrationsData: {
    [name: string]: string;
  },
  loggingPath = getLoggingPath(),
): Promise<void> {
  const logPath = `${loggingPath}/${groupId}.created-orgs.csv`;
  try {
    const integrations = Object.keys(integrationsData).map(
      (i) => `${i}:${integrationsData[i]}`,
    );
    const { id, name, created } = orgData;
    const log = `${origName},${name},${id},${created},${integrations.join(
      ',',
    )}\n`;
    fs.appendFileSync(logPath, log);
  } catch (e) {
    debug('Failed to log created orgs at location: ', logPath, e);
    // do nothing
  }
}

interface CreatedOrg extends CreatedOrgResponse {
  integrations: {
    [name: string]: string;
  };
}

export async function createOrgs(
  fileName: string,
  loggingPath = getLoggingPath(),
): Promise<CreatedOrgResponse[]> {
  const content = await loadFile(fileName);
  const orgsData: CreateOrgData[] = [];
  try {
    orgsData.push(...JSON.parse(content).orgs);
  } catch (e) {
    throw new Error(`Failed to parse orgs from ${fileName}`);
  }
  const requestManager = new requestsManager();

  debug(`Loaded ${orgsData.length} orgs to create ${Date.now()}`);
  const createdOrgs: CreatedOrg[] = [];
  orgsData.forEach(async (orgData) => {
    try {
      const { groupId, name, sourceOrgId } = orgData;
      const org = await createOrg(groupId, name, sourceOrgId);
      const integrations =
        (await listIntegrations(requestManager, org.id)) || {};
      await setNotificationPreferences(requestManager, org.id);
      createdOrgs.push({ ...org, integrations });
      logCreatedOrg(groupId, name, org, integrations, loggingPath);
    } catch (e) {
      debug(`Failed to create org with data: ${JSON.stringify(orgsData)}`, e);
    }
  });
  return createdOrgs;
}

try {
  const importFile = getImportProjectsFile();
  createOrgs(importFile);
} catch (e) {
  debug('Failed to kick off orgs creation.\n' + e);
  console.error('ERROR! Try running with `DEBUG=snyk*`');
}
