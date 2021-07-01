import * as debugLib from 'debug';
import { getLoggingPath } from '../lib/get-logging-path';
const debug = debugLib('snyk:generate-data-script');

import {
  CreatedOrg,
  SupportedIntegrationTypesImportData,
} from '../lib/types';
import { loadFile } from '../load-file';
import { generateTargetsImportDataFile } from '../scripts/generate-targets-data';

export const command = ['import:data'];
export const desc =
  'Generate data required for targets to be imported via API to create Snyk projects.\n';
export const builder = {
  orgsData: {
    required: true,
    default: undefined,
    desc: 'Path to organizations data file generated with "orgs:data" command',
  },
  source: {
    required: true,
    default: SupportedIntegrationTypesImportData.GITHUB,
    choices: [...Object.values(SupportedIntegrationTypesImportData)],
    desc:
      'The source of the targets to be imported e.g. Github, Github Enterprise, Gitlab. This will be used to make an API call to list all available entities per org',
  },
  sourceUrl: {
    required: false,
    default: undefined,
    desc:
      'Custom base url for the source API that can list organizations (e.g. Github Enterprise url)',
  },
  integrationType: {
    required: true,
    default: undefined,
    choices: [...Object.values(SupportedIntegrationTypesImportData)],
    desc:
      'The configured integration type on the created Snyk Org to use for generating import targets data. Applies to all targets.',
  },
};

const entityName: {
  [source in SupportedIntegrationTypesImportData]: string;
} = {
  github: 'org',
  'github-enterprise': 'org',
  'gitlab': 'group',
};

export async function handler(argv: {
  source: SupportedIntegrationTypesImportData;
  orgsData: string;
  integrationType: SupportedIntegrationTypesImportData;
  sourceUrl: string;
}): Promise<void> {
  try {
    getLoggingPath();
    const { source, orgsData, integrationType, sourceUrl } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));

    const content = await loadFile(orgsData);
    let orgsDataJson: CreatedOrg[];
    try {
      const orgsJson = JSON.parse(content);
      orgsDataJson = [...orgsJson.orgData];
    } catch (e) {
      throw new Error(
        `Failed to parse ${entityName[source]}s from ${orgsData}. ERROR: ${e.message}`,
      );
    }
    if (orgsDataJson.length === 0) {
      throw new Error(`No ${entityName[source]}s could be loaded from ${orgsData}.`);
    }
    const res = await generateTargetsImportDataFile(
      source,
      orgsDataJson,
      integrationType,
      sourceUrl,
    );
    const targetsMessage =
      res.targets.length > 0
        ? `Found ${res.targets.length} ${entityName[source]}(s). Written the data to file: ${res.fileName}`
        : `⚠ No import ${entityName[source]}(s) data generated!`;

    console.log(targetsMessage);
  } catch (e) {
    debug('Failed to generate data.\n' + e);
    console.error(
      `ERROR! Failed to generate data. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e}`,
    );
  }
}
