import * as debugLib from 'debug';
import { getLoggingPath } from '../lib/get-logging-path';
import { SupportedIntegrationTypesToListSnykTargets } from '../lib/types';
const debug = debugLib('snyk:generate-data-script');

import { generateSnykImportedTargets } from '../scripts/generate-imported-targets-from-snyk';

export const command = ['list:imported'];
export const desc =
  'List all targets imported in Snyk for a given group & source type. An analysis is performed on all current organizations and their projects to generate this. The generated file can be used to skip previously imported targets when running the `import` command';
export const builder = {
  groupId: {
    required: false,
    default: undefined,
    desc: 'Public id of the group in Snyk (available on group settings)',
  },
  orgId: {
    required: false,
    default: undefined,
    desc:
      'Public id of the organization in Snyk (available in organization settings)',
  },
  integrationType: {
    required: true,
    default: undefined,
    choices: [...Object.values(SupportedIntegrationTypesToListSnykTargets)],
    desc:
      'The configured integration type (source of the projects in Snyk e.g. Github, Github Enterprise.). This will be used to pick the correct integrationID from each organization in Snyk',
  },
};

const entityName: {
  [source in SupportedIntegrationTypesToListSnykTargets]: string;
} = {
  github: 'repo',
  'github-enterprise': 'repo',
  'bitbucket-cloud': 'repo',
};

export async function handler(argv: {
  groupId?: string;
  orgId?: string;
  integrationType: SupportedIntegrationTypesToListSnykTargets;
}): Promise<void> {
  getLoggingPath();
  const { groupId, integrationType, orgId } = argv;
  try {
    if (!(groupId || orgId)) {
      throw new Error(
        'Missing required parameters: orgId or groupId must be provided.',
      );
    }

    if (groupId && orgId) {
      throw new Error(
        'Too many parameters: orgId or groupId must be provided, not both.',
      );
    }
    debug('ℹ️  Options: ' + JSON.stringify(argv));
    const { targets, fileName, failedOrgs } = await generateSnykImportedTargets(
      { groupId, orgId },
      integrationType,
    );
    const targetsMessage =
      targets.length > 0
        ? `Found ${targets.length} ${entityName[integrationType]}(s). Written the data to file: ${fileName}`
        : `⚠ No ${entityName[integrationType]}(s) received for Group '${groupId}' and integration type ${integrationType}!`;

    if (failedOrgs.length > 0) {
      console.warn(
        `Failed to process the following orgs: ${failedOrgs.join(',')}`,
      );
    }
    console.log(targetsMessage);
  } catch (e) {
    debug('Failed to list all imported targets in Snyk.\n' + e);
    console.error(
      `ERROR! Failed to list imported targets in Snyk. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e.message}`,
    );
  }
}
