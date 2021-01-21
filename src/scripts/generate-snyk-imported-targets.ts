import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { listIntegrations, listProjects } from '../lib/org';
import { writeFile } from '../write-file';
import { listAllOrgsTokenBelongsTo } from '../lib/orgs';
import {
  FilePath,
  SnykProject,
  Sources,
  SupportedIntegrationTypes,
  Target,
} from '../lib/types';
import { logImportedTarget } from '../log-imported-targets';

const debug = debugLib('snyk:generate-snyk-imported-targets');

export interface ImportTarget {
  orgId: string;
  integrationId: string;
  target: Target;
  files?: FilePath[];
  exclusionGlobs?: string;
}

function projectToTarget(project: SnykProject): Target {
  const [owner, name] = project.name.split(':')[0].split('/');
  return {
    owner,
    branch: project.branch || undefined, // TODO: make it not optional
    name,
  };
}
const targetGenerators = {
  [Sources.GITHUB]: projectToTarget,
  [Sources.GHE]: projectToTarget,
};

export async function generateSnykImportedTargets(
  groupId: string,
  integrationType: SupportedIntegrationTypes,
): Promise<{ targets: ImportTarget[]; fileName: string }> {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
  });
  const targetsData: ImportTarget[] = [];
  const { orgs: allOrgs } = await listAllOrgsTokenBelongsTo(requestManager);
  const groupOrgs = allOrgs.filter(
    (org) => org.group && org.group.id === groupId,
  );
  for (const org of groupOrgs) {
    const { id } = org;
    const { projects } = await listProjects(requestManager, id);
    const integrations = await listIntegrations(requestManager, id);
    const scmTargets = projects
      .filter((p) => p.origin === integrationType)
      .map((p) => targetGenerators[p.origin as Sources](p));
    const uniqueTargets = new Set(scmTargets);
    uniqueTargets.forEach(async (target) => {
      await logImportedTarget(
        id,
        integrationType,
        target,
        undefined,
        undefined,
        'Target exists in Snyk',
      );
      targetsData.push({
        target,
        integrationId: integrations[integrationType],
        orgId: id,
      });
    });
  }
  // TODO: write to file and return filename
  if (targetsData.length === 0) {
    debug('No targets could be generated. Could Snyk Group have no projects?');
  }
  return { targets: targetsData, fileName: 'TODO' };
}
