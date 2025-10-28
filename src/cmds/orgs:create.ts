import debugLib from 'debug';
// yargs not used here after bundler-friendly exit handling
const debug = debugLib('snyk:orgs-create-script');

import { getLoggingPath } from '../lib';
import type { CommandResult } from '../lib/types';
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
    desc: 'Skip creating an organization if the given name is already taken within the Group.',
  },
  includeExistingOrgsInOutput: {
    required: false,
    default: true,
    desc: 'Log existing organization information as well as newly created',
  },
};

export async function createOrg(
  file: string,
  includeExistingOrgsInOutput: boolean,
  noDuplicateNames?: boolean,
): Promise<CommandResult> {
  try {
    getLoggingPath();
    const res = await createOrgs(file, {
      noDuplicateNames,
      includeExistingOrgsInOutput,
    });

    const orgsMessage =
      res.orgs.length > 0
        ? `Created ${res.orgs.length} out of ${res.totalOrgs} organization(s). Written the data to file: ${res.fileName}`
        : `⚠ No organization(s) created!`;

    return {
      fileName: res.fileName,
      exitCode: 0,
      message: orgsMessage,
    };
  } catch (e) {
    const errorMessage = `ERROR! Failed to create organizations.\nTry running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e.message}`;
    return {
      fileName: undefined,
      exitCode: 1,
      message: errorMessage,
    };
  }
}

export async function handler(argv: {
  file: string;
  includeExistingOrgsInOutput: boolean;
  noDuplicateNames?: boolean;
}): Promise<void> {
  const { file, noDuplicateNames, includeExistingOrgsInOutput } = argv;
  debug('ℹ️  Options: ' + JSON.stringify(argv));

  const res = await createOrg(
    file,
    includeExistingOrgsInOutput,
    noDuplicateNames,
  );

  if (res.exitCode === 1) {
    debug('Failed to create organizations.\n' + res.message);

    console.error(res.message);
    // Avoid yargs.exit; set exitCode after small delay so logs flush
    setTimeout(() => {
      process.exitCode = 1;
    }, 3000);
  } else {
    console.log(res.message);
  }
}
