import * as debugLib from 'debug';
const debug = debugLib('snyk:generate-data-script');

import { getLoggingPath } from '../lib';
import { createOrgs } from '../scripts/create-orgs';

export const command = ['orgs:create'];
export const desc =
  'Create the Orgs in Snyk based on data file generated with `orgs:data` command';
export const builder = {
  file: {
    required: true,
    default: undefined,
    desc: 'Path to data file generated with `orgs:data` command',
  },
};

export async function handler(argv: {
  file: string;
}): Promise<void> {
  try {
    getLoggingPath();
    const { file } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));
    const res = await createOrgs(file)

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
