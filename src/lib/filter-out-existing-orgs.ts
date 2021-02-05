import { requestsManager } from 'snyk-request-manager';
import { getAllOrgs } from './get-all-orgs-for-group';
import { CreateOrgData } from './types';

export async function filterOutExistingOrgs(
  requestManager: requestsManager,
  orgs: CreateOrgData[] = [],
  groupId: string,
): Promise<{
  existingOrgs: CreateOrgData[];
  newOrgs: CreateOrgData[];
}> {
  if (!groupId) {
    throw new Error('Missing required param groupId');
  }
  if (orgs.length === 0) {
    return { existingOrgs: [], newOrgs: [] };
  }

  const existingOrgs: CreateOrgData[] = [];
  const newOrgs: CreateOrgData[] = [];
  const groupOrgs = await getAllOrgs(requestManager, groupId);
  const uniqueOrgNames: Set<string> = new Set(groupOrgs.map((org) => org.name));
  for (const org of orgs) {
    if (uniqueOrgNames.has(org.name)) {
      existingOrgs.push(org);
      continue;
    }
    newOrgs.push(org);
  }

  return { existingOrgs, newOrgs };
}
