import * as debugLib from 'debug';
const debug = debugLib('snyk:generate-data-script');

import { getLoggingPath } from '../lib/get-logging-path';
import {
  generateOrgImportDataFile,
  Sources,
} from '../scripts/generate-org-data';

export const command = ['orgs:data'];
export const desc =
  'Generate data required for Orgs to be created via API by mirroring a given source.\n';
export const builder = {
  sourceOrgPublicId: {
    required: false,
    default: undefined,
  },
  groupId: {
    required: true,
    default: undefined,
    desc: 'Public id of the group in Snyk (available on group settings)',
  },
  source: {
    required: true,
    default: Sources.GITHUB,
    choices: [Sources.GITHUB],
    desc: 'The source of the targets to be imported e.g. Github',
  },
};

const entityName = {
  github: 'org',
};

export async function handler(argv: {
  source: Sources;
  groupId: string;
  sourceOrgPublicId?: string;
}): Promise<void> {
  try {
    getLoggingPath();
    const { source, sourceOrgPublicId, groupId } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));

    const res = await generateOrgImportDataFile(
      source,
      groupId,
      sourceOrgPublicId,
    );
    const orgsMessage =
      res.orgs.length > 0
        ? `Found ${res.orgs.length} ${entityName[source]}(s). Written the data to file: ${res.fileName}`
        : `⚠ No ${entityName[source]}(s) found!`;

    console.log(orgsMessage);
  } catch (e) {
    debug('Failed to generate data.\n' + e);
    console.error(
      `ERROR! Failed to generate data. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e}`,
    );
  }
}
