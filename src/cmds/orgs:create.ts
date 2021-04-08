import * as debugLib from 'debug';
const debug = debugLib('snyk:generate-data-script');

import { getLoggingPath } from '../lib';
import { createOrgs } from '../scripts/create-orgs';

export const command = ['orgs:create'];
export const desc =
  'Create the organizations in Snyk based on data file generated with `orgs:data` command. Output generates key data for created and existing organizations for use to generate project import data.';
export const builder = {
  file: {
    required: true,
    default: undefined,
    desc: 'Path to data file generated with `orgs:data` command',
  },
  noDuplicateNames: {
    required: false,
    desc:
      'Skip creating an organization if the given name is already taken within the Group.',
  },
  includeExistingOrgsInOutput: {
    required: false,
    default: true,
    desc: 'Log existing organization information as well as newly created',
  },
};

export async function handler(argv: {
  file: string;
  includeExistingOrgsInOutput: boolean;
  noDuplicateNames?: boolean;
}): Promise<void> {
  try {
    getLoggingPath();
    const { file, noDuplicateNames, includeExistingOrgsInOutput } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));
    const res = await createOrgs(file, {
      noDuplicateNames,
      includeExistingOrgsInOutput,
    });

    const orgsMessage =
      res.orgs.length > 0
        ? `Created ${res.orgs.length} out of ${res.totalOrgs} organization(s). Written the data to file: ${res.fileName}`
        : `⚠ No organization(s) created!`;

    console.log(orgsMessage);
  } catch (e) {
    debug('Failed to create organizations.\n' + e);
    console.error(
      `ERROR! Failed to create organizations. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e}`,
    );
  }
}
