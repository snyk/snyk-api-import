import * as debugLib from 'debug';
import * as path from 'path';
import * as fs from 'fs';

import { createOrg, filterOutExistingOrgs } from '../lib';
import type { CreatedOrgResponse } from '../lib';

import { getLoggingPath } from './../lib';
import { listIntegrations, setNotificationPreferences } from '../lib/api/org';
import { requestsManager } from 'snyk-request-manager';
import type { CreateOrgData, Org } from '../lib/types';
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
  await writeFile(fileName, { orgData } as unknown as JSON);
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
      debug(`Creating new "${name}" organization`);
      const org = await createOrg(requestManager, groupId, name, sourceOrgId);
      debug(`Creating new "${name}" organization`);
      debug(`Listing integrations for new "${name}" organization`);
      const integrations =
        (await listIntegrations(requestManager, org.id)) || {};
      debug(`Setting notification settings for new "${name}" organization`);
      await setNotificationPreferences(requestManager, org.id, org.name);
      created.push({
        ...org,
        orgId: org.id,
        integrations,
        groupId,
        origName: name,
        sourceOrgId,
      });
      await logCreatedOrg(groupId, name, org, integrations, loggingPath);
    } catch (e) {
      failed.push({ groupId, name, sourceOrgId });
      const errorMessage = e.data ? e.data.message : e.message;
      await logFailedOrg(
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

  const orgsFilePath = path.resolve(process.cwd(), filePath);
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
  const allExistingOrgs: Org[] = [];
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:create-orgs',
  });

  for (const groupId in orgsPerGroup) {
    let orgsToCreate = orgsPerGroup[groupId];
    debug(`Finding existing organizations in group ${groupId}`);
  // (debug logging removed)

    const { newOrgs, existingOrgs } = await separateExistingOrganizations(
      loggingPath,
      requestManager,
      groupId,
      orgsToCreate,
    );
    allExistingOrgs.push(...existingOrgs);
    debug(`Found ${existingOrgs.length} existing organizations`);

    if (noDuplicateNames) {
      let duplicates = 0;
      const uniqueOrgNames: Set<string> = new Set(
        existingOrgs.map((org) => org.name),
      );
      for (const org of orgsToCreate) {
        const { name } = org;
        if (uniqueOrgNames.has(name)) {
          duplicates += 1;
          failedOrgs.push(org);
          await logFailedOrg(
            groupId,
            name,
            'Refusing to create a duplicate organization with option --noDuplicateNames enabled.',
          );
        }
      }
      debug(`Skipping ${duplicates} duplicate organizations`);
      orgsToCreate = newOrgs;
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

  if (createdOrgs.length === 0 && !includeExistingOrgsInOutput) {
    throw new Error(
      `All requested organizations failed to be created. Review the errors in ${path.resolve(
        __dirname,
        loggingPath,
      )}/<groupId>.${FAILED_ORG_LOG_NAME}`,
    );
  }
  debug(`Getting existing ${allExistingOrgs.length} orgs data`);
  let existing: Partial<NewOrExistingOrg>[] = [];

  if (includeExistingOrgsInOutput) {
    // allExistingOrgs now only contains orgs that were requested to be created but already existed
    const res = await listExistingOrgsData(requestManager, allExistingOrgs);
    existing = res.existing;
  }

  // Determine what to save: when includeExistingOrgsInOutput is true, save
  // both created and existing orgs requested by the run. Otherwise save
  // only the newly created orgs.
  const toSave = includeExistingOrgsInOutput ? [...createdOrgs, ...existing] : [];
  const fileName = await saveCreatedOrgData(toSave as Partial<NewOrExistingOrg>[]);
  return {
    orgs: createdOrgs,
    existing,
    failed: failedOrgs,
    fileName,
    totalOrgs: orgsData.length,
  };
}

async function separateExistingOrganizations(
  loggingPath: string,
  requestManager: requestsManager,
  groupId: string,
  orgsPerGroup: CreateOrgData[],
): Promise<{ existingOrgs: Org[]; newOrgs: CreateOrgData[] }> {
  try {
    return await filterOutExistingOrgs(requestManager, orgsPerGroup, groupId);
  } catch (_e) {
    const err: any = _e;
    const humanMessage =
      err && typeof err === 'object'
        ? err.data?.message ?? err.message ?? String(err)
        : String(err);
    const finalMessage =
      humanMessage || 'Failed to create org, please try again in DEBUG mode.';
    for (const org of orgsPerGroup) {
      const { name } = org;
      await logFailedOrg(groupId, name, finalMessage);
    }
    throw new Error(
      `All requested organizations failed to be created. Review the errors in ${path.resolve(
        __dirname,
        loggingPath,
      )}/<groupId>.${FAILED_ORG_LOG_NAME}`,
    );
  }
}
