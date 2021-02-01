import { requestsManager } from 'snyk-request-manager';
import { listAllOrgsTokenBelongsTo } from './api/orgs';
import { Org } from './types';

export async function getAllOrgs(
  requestManager: requestsManager,
  groupId: string,
): Promise<Org[]> {
  if (!groupId) {
    throw new Error("Missing required param groupId");
  }
  const allOrgsTokenHasAccessTo = await listAllOrgsTokenBelongsTo(
    requestManager,
  );
  const groupOrgs = allOrgsTokenHasAccessTo.orgs.filter(
    (org) => org.group && org.group.id === groupId,
  );
  return groupOrgs;
}
