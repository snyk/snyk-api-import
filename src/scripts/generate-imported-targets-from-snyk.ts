import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as pMap from 'p-map';
import * as _ from 'lodash';

import {
  FilePath,
  Org,
  SnykProject,
  Sources,
  SupportedIntegrationTypes,
  Target,
} from '../lib/types';
import { getAllOrgs, listIntegrations, listProjects } from '../lib';
import { logImportedTarget } from '../loggers/log-imported-targets';
import { IMPORT_LOG_NAME, targetProps } from '../common';

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
): Promise<{ targets: ImportTarget[]; fileName: string; failedOrgs: Org[] }> {
  const timeLabel = 'Generated imported Snyk targets';
  console.time(timeLabel);
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import',
  });
  const targetsData: ImportTarget[] = [];
  const groupOrgs = await getAllOrgs(requestManager, groupId);
  const failedOrgs: Org[] = [];
  await pMap(
    groupOrgs,
    async (org: Org) => {
      const { id, name, slug } = org;
      try {
        const [resProjects, resIntegrations] = await Promise.all([
          listProjects(requestManager, id),
          listIntegrations(requestManager, id),
        ]);
        const { projects } = resProjects;

        const scmTargets = projects
          .filter((p) => p.origin === integrationType)
          .map((p) => targetGenerators[p.origin as Sources](p));
        const uniqueTargets = new Set(scmTargets);
        for (const target of uniqueTargets) {
          await logImportedTarget(
            id,
            integrationType,
            target,
            null,
            undefined,
            'Target exists in Snyk',
          );
          targetsData.push({
            target: _.pick(target, ...targetProps),
            integrationId: resIntegrations[integrationType],
            orgId: id,
          });
        }
      } catch (e) {
        failedOrgs.push(org);
        console.warn(
          `Failed to process projects for org ${name}(${slug}). Continuing.`,
        );
      }
    },
    { concurrency: 30 },
  );
  if (targetsData.length === 0) {
    debug('No targets could be generated. Could Snyk Group have no projects?');
    console.warn(
      `No targets could be generated. Could Snyk Orgs in the Group (${groupId}) be empty?`,
    );
  }
  console.timeEnd(timeLabel);
  return { targets: targetsData, fileName: IMPORT_LOG_NAME, failedOrgs };
}
