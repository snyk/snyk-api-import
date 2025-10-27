// Removed unused lodash import

import type { requestsManager } from 'snyk-request-manager';
import { getAllOrgs } from './api/group';
import type { CreateOrgData, Org } from './types';

export async function filterOutExistingOrgs(
  requestManager: requestsManager,
  orgs: CreateOrgData[] = [],
  groupId: string,
): Promise<{
  existingOrgs: Org[];
  newOrgs: CreateOrgData[];
}> {
  if (!groupId) {
    throw new Error('Missing required param groupId');
  }
  if (orgs.length === 0) {
    return { existingOrgs: [], newOrgs: [] };
  }

  const existingOrgs: Org[] = [];
  const newOrgs: CreateOrgData[] = [];
  const groupOrgs = await getAllOrgs(requestManager, groupId);
  const uniqueOrgNames: Set<string> = new Set(groupOrgs.map((org) => org.name));
  for (const org of orgs) {
    if (!uniqueOrgNames.has(org.name)) {
      newOrgs.push(org);
    } else {
      // Find the existing org that matches this requested org
      const existingOrg = groupOrgs.find(
        (groupOrg) => groupOrg.name === org.name,
      );
      if (existingOrg) {
        existingOrgs.push(existingOrg);
      }
    }
  }
  if (existingOrgs.length > 0) {
    console.log(
      `Skipped creating ${
        existingOrgs.length
      } organization(s) as the names were already used in the Group ${groupId}. Organizations skipped: ${existingOrgs
        .map((o) => o.name)
        .join(', ')}`,
    );
  }

  return { existingOrgs, newOrgs };
}
