import * as debugLib from 'debug';

import { loadFile } from '../load-file';
import { CreatedOrgResponse, createOrg } from '../lib';
import { getLoggingPath } from './../lib';
import { listIntegrations, setNotificationPreferences } from '../lib/api/org';
import { requestsManager } from 'snyk-request-manager';
import { CreateOrgData } from '../lib/types';
import { logCreatedOrg } from '../loggers/log-created-org';
import { logFailedOrg } from '../loggers/log-failed-org';
import { writeFile } from '../write-file';
import { FAILED_ORG_LOG_NAME } from '../common';

const debug = debugLib('snyk:create-orgs-script');
interface CreatedOrg extends CreatedOrgResponse {
  integrations: {
    [name: string]: string;
  };
  orgId: string;
  groupId: string;
  origName: string; // name requested to be created
  sourceOrgId?: string;
}

async function saveCreatedOrgData(orgData: CreatedOrg[]): Promise<string> {
  const fileName = 'snyk-created-orgs.json';
  await writeFile(fileName, ({ orgData } as unknown) as JSON);
  return fileName;
}

export async function createOrgs(
  filePath: string,
  loggingPath = getLoggingPath(),
): Promise<{
  orgs: CreatedOrg[];
  failed: CreateOrgData[];
  fileName: string;
  totalOrgs: number;
}> {
  const content = await loadFile(filePath);
  const orgsData: CreateOrgData[] = [];
  const failedOrgs: CreateOrgData[] = [];

  try {
    orgsData.push(...JSON.parse(content).orgs);
  } catch (e) {
    throw new Error(`Failed to parse orgs from ${filePath}`);
  }
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
  });
  debug(`Loaded ${orgsData.length} orgs to create ${Date.now()}`);
  const createdOrgs: CreatedOrg[] = [];

  for (const orgData of orgsData) {
    const { groupId, name, sourceOrgId } = orgData;
    try {
      const org = await createOrg(requestManager, groupId, name, sourceOrgId);
      const integrations =
        (await listIntegrations(requestManager, org.id)) || {};
      await setNotificationPreferences(requestManager, org.id, orgData);
      createdOrgs.push({
        ...org,
        orgId: org.id,
        integrations,
        groupId,
        origName: name,
        sourceOrgId,
      });
      logCreatedOrg(groupId, name, org, integrations, loggingPath);
    } catch (e) {
      failedOrgs.push({ groupId, name, sourceOrgId });
      const errorMessage = e.data ? e.data.message : e.message;
      logFailedOrg(
        groupId,
        name,
        errorMessage || 'Failed to create org, please try again in DEBUG mode.',
      );
      debug(`Failed to create org with data: ${JSON.stringify(orgsData)}`, e);
    }
  }
  if (failedOrgs.length === orgsData.length) {
    throw new Error(`All requested orgs failed to be created. Review the errors in ${loggingPath}/<groupId>.${FAILED_ORG_LOG_NAME}`)
  }
  const fileName = await saveCreatedOrgData(createdOrgs);
  return { orgs: createdOrgs, failed: failedOrgs, fileName, totalOrgs: orgsData.length };
}
