import * as debugLib from 'debug';
const debug = debugLib('snyk:orgs-data-script');

import { getLoggingPath } from '../lib/get-logging-path';
import { SupportedIntegrationTypesImportOrgData } from '../lib/types';
import {
  entityName,
  generateOrgImportDataFile,
} from '../scripts/generate-org-data';

export const command = ['orgs:data'];
export const desc =
  'Generate data required for Orgs to be created via API by mirroring a given source.\n';
export const builder = {
  sourceOrgPublicId: {
    required: false,
    default: undefined,
    desc:
      'Public id of the organization in Snyk that can be used as a template to copy all supported organization settings.',
  },
  groupId: {
    required: true,
    default: undefined,
    desc: 'Public id of the group in Snyk (available on group settings)',
  },
  sourceUrl: {
    required: false,
    default: undefined,
    desc:
      'Custom base url for the source API that can list organizations (e.g. Github Enterprise url)',
  },
  skipEmptyOrgs: {
    required: false,
    desc:
      'Skip any organizations that do not any targets. (e.g. Github Organization does not have any repos)',
  },
  source: {
    required: true,
    default: SupportedIntegrationTypesImportOrgData.GITHUB,
    choices: [...Object.values(SupportedIntegrationTypesImportOrgData)],
    desc:
      'The source of the targets to be imported e.g. Github, Github Enterprise, Gitlab, Bitbucket Server, Bitbucket Cloud',
  },
};

export async function handler(argv: {
  source: SupportedIntegrationTypesImportOrgData;
  groupId: string;
  sourceOrgPublicId?: string;
  sourceUrl?: string;
  skipEmptyOrgs?: boolean;
}): Promise<void> {
  try {
    getLoggingPath();
    const {
      source,
      sourceOrgPublicId,
      groupId,
      sourceUrl,
      skipEmptyOrgs = false,
    } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));

    const res = await generateOrgImportDataFile(
      source,
      groupId,
      sourceOrgPublicId,
      sourceUrl,
      skipEmptyOrgs,
    );
    const orgsMessage =
      res.orgs.length > 0
        ? `Found ${res.orgs.length} ${entityName[source]}(s). Written the data to file: ${res.fileName}`
        : `⚠ No ${entityName[source]}(s) found!`;

    console.log(orgsMessage);
  } catch (e) {
    debug('Failed to generate data.\n' + e);
    console.error(
      `ERROR! Failed to generate data. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e.message}`,
    );
  }
}
