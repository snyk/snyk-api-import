import * as debugLib from 'debug';
import * as fs from 'fs';

import { loadFile } from '../load-file';
import { CreatedOrgResponse, createOrg } from '../lib';
import { getLoggingPath } from '../lib/get-logging-path';

const debug = debugLib('snyk:import-projects-script');

interface CreateOrgData {
  groupId: string;
  name: string;
  sourceOrgId?: string;
}

export async function logCreatedOrg(
  origName: string,
  orgData: CreatedOrgResponse,
  loggingPath: string = getLoggingPath(),
): Promise<void> {
  try {
    const { id, name, created } = orgData;
    const log = `${origName},${name},${id},${created}\n`;
    fs.appendFileSync(`${loggingPath}/created-orgs.csv`, log);
  } catch (e) {
    // do nothing
  }
}
export async function CreateOrgs(
  fileName: string,
  loggingPath: string,
): Promise<CreatedOrgResponse[]> {
  const content = await loadFile(fileName);
  const orgsData: CreateOrgData[] = [];
  try {
    orgsData.push(...JSON.parse(content).orgs);
  } catch (e) {
    throw new Error(`Failed to parse orgs from ${fileName}`);
  }
  debug(`Loaded ${orgsData.length} orgs to create ${Date.now()}`);
  const createdOrgs: CreatedOrgResponse[] = [];
  orgsData.forEach(async (orgData) => {
    try {
      const { groupId, name, sourceOrgId } = orgData;
      const org = await createOrg(groupId, name, sourceOrgId);
      createdOrgs.push(org);
      logCreatedOrg(name, org, loggingPath);
    } catch (e) {
      debug(`Failed to create org with data: ${JSON.stringify(orgsData)}`);
    }
  });

  return createdOrgs;
}
