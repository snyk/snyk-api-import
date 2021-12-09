import * as debugLib from 'debug';
import * as path from 'path';
import * as fs from 'fs';

import { CreatedOrgResponse, createOrg, filterOutExistingOrgs } from '../lib';
import { getLoggingPath } from './../lib';
import { listIntegrations, setNotificationPreferences } from '../lib/api/org';
import { requestsManager } from 'snyk-request-manager';
import { CreateOrgData, Org } from '../lib/types';
import { logCreatedOrg } from '../loggers/log-created-org';
import { writeFile } from '../write-file';
import { FAILED_ORG_LOG_NAME } from '../common';
import { logFailedOrg } from '../loggers/log-failed-org';
import { streamData } from '../stream-data';

const debug = debugLib('snyk:create-orgs-script');
interface NewOrExistingOrg extends CreatedOrgResponse {
  integrations: {
    [name: string]: string;
  };
  orgId: string;
  groupId: string;
  origName: string; // name requested to be created
  sourceOrgId?: string;
}

async function saveCreatedOrgData(
  orgData: Partial<NewOrExistingOrg>[],
): Promise<string> {
  const fileName = 'snyk-created-orgs.json';
  await writeFile(fileName, ({ orgData } as unknown) as JSON);
  return fileName;
}
async function createNewOrgs(
  loggingPath: string,
  requestManager: requestsManager,
  groupId: string,
  orgsToCreate: CreateOrgData[],
): Promise<{ failed: CreateOrgData[]; created: NewOrExistingOrg[] }> {
  const failed: CreateOrgData[] = [];
  const created: NewOrExistingOrg[] = [];

  for (const orgData of orgsToCreate) {
    const { name, sourceOrgId } = orgData;
    try {
      const org = await createOrg(requestManager, groupId, name, sourceOrgId);
      const integrations =
        (await listIntegrations(requestManager, org.id)) || {};
      await setNotificationPreferences(requestManager, org.id, org.name);
      created.push({
        ...org,
        orgId: org.id,
        integrations,
        groupId,
        origName: name,
        sourceOrgId,
      });
      logCreatedOrg(groupId, name, org, integrations, loggingPath);
    } catch (e) {
      failed.push({ groupId, name, sourceOrgId });
      const errorMessage = e.data ? e.data.message : e.message;
      logFailedOrg(
        groupId,
        name,
        errorMessage || 'Failed to create org, please try again in DEBUG mode.',
      );
      debug(
        `Failed to create organization with data: ${JSON.stringify(orgData)}`,
        e,
      );
    }
  }

  return { failed, created };
}

async function listExistingOrgsData(
  requestManager: requestsManager,
  existingOrgs: Org[],
): Promise<{ existing: Partial<NewOrExistingOrg>[] }> {
  const previouslyCreated: Partial<NewOrExistingOrg>[] = [];

  for (const orgData of existingOrgs) {
    const { name, id, group } = orgData;
    try {
      const integrations = (await listIntegrations(requestManager, id)) || {};
      previouslyCreated.push({
        ...orgData,
        name,
        orgId: id,
        integrations,
        groupId: group.id,
        origName: name,
      });
    } catch (e) {
      debug(
        `Failed to list integrations for Org: ${orgData.name} (${orgData.id})`,
        e,
      );
    }
  }
  return { existing: previouslyCreated };
}

export async function createOrgs(
  filePath: string,
  options: {
    noDuplicateNames?: boolean;
    includeExistingOrgsInOutput: boolean;
  } = {
    noDuplicateNames: false,
    includeExistingOrgsInOutput: true,
  },
  loggingPath = getLoggingPath(),
): Promise<{
  orgs: NewOrExistingOrg[];
  failed: CreateOrgData[];
  fileName: string;
  totalOrgs: number;
  existing: Partial<NewOrExistingOrg>[];
}> {
  const { includeExistingOrgsInOutput, noDuplicateNames } = options;
  const failedOrgs: CreateOrgData[] = [];
  let orgsData: CreateOrgData[];

  const orgsFilePath = path.resolve(process.cwd(), loggingPath, filePath);
  if (!fs.existsSync(orgsFilePath)) {
    throw new Error(`File not found ${orgsFilePath}`);
  }
  try {
    orgsData = await streamData<CreateOrgData>(orgsFilePath, 'orgs');
  } catch (e) {
    throw new Error(`Failed to parse organizations from ${filePath}`);
  }
  debug(`Loaded ${orgsData.length} organizations to create ${Date.now()}`);

  const orgsPerGroup: {
    [groupId: string]: CreateOrgData[];
  } = {};

  orgsData.forEach((org) => {
    const { groupId } = org;
    if (!orgsPerGroup[groupId]) {
      orgsPerGroup[groupId] = [org];
    } else {
      orgsPerGroup[groupId].push(org);
    }
  });

  const createdOrgs: NewOrExistingOrg[] = [];
  const existingOrgs: Org[] = [];
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
  });

  for (const groupId in orgsPerGroup) {
    let orgsToCreate = orgsPerGroup[groupId];
    debug(`Finding existing organizations in group ${groupId}`);
    const res = await filterOutExistingOrgs(requestManager, orgsData, groupId);
    existingOrgs.push(...res.existingOrgs);
    debug(`Found ${existingOrgs.length} existing organizations`);

    if (noDuplicateNames) {
      orgsToCreate = res.newOrgs;
      failedOrgs.push(
        ...res.existingOrgs.map((o) => ({
          groupId: o.group.id,
          name: o.name,
        })),
      );
      debug(`Found ${failedOrgs.length} duplicate organizations`);
    }
    debug(`Creating ${orgsToCreate.length} new organizations`);
    const { failed, created } = await createNewOrgs(
      loggingPath,
      requestManager,
      groupId,
      orgsToCreate,
    );
    failedOrgs.push(...failed);
    createdOrgs.push(...created);
  }

  if (createdOrgs.length === 0) {
    throw new Error(
      `All requested organizations failed to be created. Review the errors in ${path.resolve(
        __dirname,
        loggingPath,
      )}/<groupId>.${FAILED_ORG_LOG_NAME}`,
    );
  }
  debug(`Getting existing ${existingOrgs.length} orgs data`);
  const { existing } = await listExistingOrgsData(requestManager, existingOrgs);
  debug('Saving results');
  const allOrgs: Partial<NewOrExistingOrg>[] = [...createdOrgs];
  if (includeExistingOrgsInOutput) {
    allOrgs.push(...existing);
  }
  const fileName = await saveCreatedOrgData(allOrgs);
  return {
    orgs: createdOrgs,
    existing: includeExistingOrgsInOutput ? existing : [],
    failed: failedOrgs,
    fileName,
    totalOrgs: orgsData.length,
  };
}
