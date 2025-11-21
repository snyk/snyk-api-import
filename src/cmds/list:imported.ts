import debugLib from 'debug';
import * as lodash from 'lodash';
// yargs not used here after bundler-friendly exit handling
import { getLoggingPath } from '../lib/get-logging-path';
import type { CommandResult } from '../lib/types';
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
    desc: 'Public id of the organization in Snyk (available in organization settings)',
  },
  integrationType: {
    required: true, // TODO: allow to not set any type to return all
    default: [...Object.values(SupportedIntegrationTypesToListSnykTargets)],
    choices: [...Object.values(SupportedIntegrationTypesToListSnykTargets)],
    desc: 'The configured integration type (source of the projects in Snyk e.g. Github, Github Enterprise.). This will be used to pick the correct integrationID from each org in Snyk E.g. --integrationType=github, --integrationType=github-enterprise',
  },
};

/* eslint-disable @typescript-eslint/naming-convention */
const entityName: {
  [source in SupportedIntegrationTypesToListSnykTargets]: string;
} = {
  github: 'repo',
  'github-cloud-app': 'repo',
  'github-enterprise': 'repo',
  'bitbucket-cloud': 'repo',
  'bitbucket-cloud-app': 'repo',
  gcr: 'images',
  'docker-hub': 'images',
  gitlab: 'repo',
  'azure-repos': 'repo',
  'bitbucket-server': 'repo',
};
/* eslint-enable @typescript-eslint/naming-convention */

export async function createListImported(
  integrationType: SupportedIntegrationTypesToListSnykTargets,
  groupId?: string,
  orgId?: string,
): Promise<CommandResult> {
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

    const integrationTypes = lodash.castArray(integrationType);
    const { targets, fileName, failedOrgs } = await generateSnykImportedTargets(
      { groupId, orgId },
      integrationTypes,
    );
    const integrationEntity =
      integrationTypes.length > 1 ? 'target' : entityName[integrationTypes[0]];

    const entityMessage = groupId ? `Group ${groupId} ` : `Org ${orgId}`;
    const targetsMessage =
      targets.length > 0
        ? `Found ${targets.length} ${integrationEntity}(s). Written the data to file: ${fileName}`
        : `⚠ No ${integrationEntity}(s) ${entityMessage} and integration type(s) ${integrationTypes.join(
            ', ',
          )}!`;

    if (failedOrgs.length > 0) {
      console.warn(
        `Failed to process the following orgs: ${failedOrgs
          .map((org) => org.id)
          .join(',')}`,
      );
    }

    return {
      fileName: fileName,
      exitCode: 0,
      message: targetsMessage,
    };
  } catch (e) {
    const errorMessage = `ERROR! Failed to list imported targets in Snyk. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e.message}`;

    return {
      fileName: undefined,
      exitCode: 1,
      message: errorMessage,
    };
  }
}

export async function handler(argv: {
  groupId?: string;
  orgId?: string;
  integrationType: SupportedIntegrationTypesToListSnykTargets;
}): Promise<void> {
  getLoggingPath();
  const { groupId, integrationType, orgId } = argv;

  debug('ℹ️  Options: ' + JSON.stringify(argv));

  const res = await createListImported(integrationType, groupId, orgId);

  if (res.exitCode === 1) {
    debug('Failed to create organizations.\n' + res.message);

    console.error(res.message);
    // Avoid yargs.exit; set process.exitCode after short delay to allow logs to flush
    setTimeout(() => {
      process.exitCode = 1;
    }, 3000);
  } else {
    console.log(res.message);
  }
}
