import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as path from 'path';
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
import { getAllOrgs, getLoggingPath, listIntegrations, listProjects } from '../lib';
import { logImportedTargets } from '../loggers/log-imported-targets';
import { IMPORT_LOG_NAME, targetProps } from '../common';
import { generateTargetId } from '../generate-target-id';

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
      const { id: orgId, name, slug } = org;
      try {
        const [resProjects, resIntegrations] = await Promise.all([
          listProjects(requestManager, orgId),
          listIntegrations(requestManager, orgId),
        ]);
        const integrationId = resIntegrations[integrationType];
        const { projects } = resProjects;
        const scmTargets = projects
          .filter((p) => p.origin === integrationType)
          .map((p) => targetGenerators[p.origin as Sources](p));
        const uniqueTargets: Set<string> = new Set();
        const orgTargets: Target[] = [];
        if (!scmTargets.length || scmTargets.length === 0) {
          console.warn('No projects in org', orgId);
          return;
        }
        for (const target of scmTargets) {
          const targetId = generateTargetId(orgId, integrationId, target);
          if (uniqueTargets.has(targetId)) {
            continue;
          }
          uniqueTargets.add(targetId);
          const importedTarget = {
            target: _.pick(target, ...targetProps),
            integrationId,
            orgId,
          };
          targetsData.push(importedTarget);
          orgTargets.push(target);
        }
        console.log(
          'Extracted',
          uniqueTargets.size,
          'unique targets from',
          scmTargets.length,
          'projects from org',
          orgId,
        );
        await logImportedTargets(
          orgId,
          integrationId,
          orgTargets,
          null,
          undefined,
          'Target exists in Snyk',
        );
      } catch (e) {
        failedOrgs.push(org);
        console.warn(
          `Failed to process projects for org ${name}(${slug}). Continuing.`,
        );
      }
    },
    { concurrency: 15 },
  );
  if (targetsData.length === 0) {
    debug('No targets could be generated. Could Snyk Group have no projects?');
    console.warn(
      `No targets could be generated. Could Snyk Orgs in the Group (${groupId}) be empty?`,
    );
  }
  console.timeEnd(timeLabel);
  return { targets: targetsData, fileName: path.resolve(getLoggingPath(), IMPORT_LOG_NAME), failedOrgs };
}
