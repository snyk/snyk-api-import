import debugLib from 'debug';
// yargs not used here after bundler-friendly exit handling
import { getLoggingPath } from '../lib/get-logging-path';
const debug = debugLib('snyk:generate-data-script');

import { SupportedIntegrationTypesImportData } from '../lib/types';
import type { CreatedOrg, CommandResult } from '../lib/types';
import { loadFile } from '../load-file';
import { generateTargetsImportDataFile } from '../scripts/generate-targets-data';

export const command = ['import:data'];
export const desc =
  'Generate data required for targets to be imported via API to create Snyk projects.\n';
export const builder = {
  orgsData: {
    required: true,
    default: undefined,
    desc: 'Path to organizations data file generated with "orgs:create" command',
  },
  source: {
    required: true,
    default: SupportedIntegrationTypesImportData.GITHUB,
    choices: [...Object.values(SupportedIntegrationTypesImportData)],
    desc: 'The source of the targets to be imported e.g. Github, Github Enterprise, Gitlab, Azure. This will be used to make an API call to list all available entities per org',
  },
  sourceUrl: {
    required: false,
    default: undefined,
    desc: 'Custom base url for the source API that can list organizations (e.g. Github Enterprise url)',
  },
};

/* eslint-disable @typescript-eslint/naming-convention */
const entityName: {
  [source in SupportedIntegrationTypesImportData]: string;
} = {
  github: 'org',
  'github-cloud-app': 'org',
  'github-enterprise': 'org',
  gitlab: 'group',
  'azure-repos': 'org',
  'bitbucket-server': 'project',
  'bitbucket-cloud': 'workspace',
  'bitbucket-cloud-app': 'workspace',
};

/* eslint-enable @typescript-eslint/naming-convention */

export async function generateOrgData(
  source: SupportedIntegrationTypesImportData,
  orgsData: string,
  sourceUrl: string,
): Promise<CommandResult> {
  try {
    getLoggingPath();
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
      throw new Error(
        `No ${entityName[source]}s could be loaded from ${orgsData}.`,
      );
    }
    const res = await generateTargetsImportDataFile(
      source,
      orgsDataJson,
      sourceUrl,
    );
    const targetsMessage =
      res.targets.length > 0
        ? `Found ${res.targets.length} ${entityName[source]}(s). Written the data to file: ${res.fileName}`
        : `⚠ No import ${entityName[source]}(s) data generated!`;

    return {
      fileName: res.fileName,
      exitCode: 0,
      message: targetsMessage,
    };
  } catch (e) {
    const errorMessage = `ERROR! Failed to generate data. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e}`;

    return {
      fileName: undefined,
      exitCode: 1,
      message: errorMessage,
    };
  }
}

export async function handler(argv: {
  source: SupportedIntegrationTypesImportData;
  orgsData: string;
  sourceUrl: string;
}): Promise<void> {
  const { source, orgsData, sourceUrl } = argv;
  debug('ℹ️  Options: ' + JSON.stringify(argv));

  const res = await generateOrgData(source, orgsData, sourceUrl);

  if (res.exitCode === 1) {
    debug('Failed to create organizations.\n' + res.message);

    console.error(res.message);
    // Avoid yargs.exit (bundler warns about missing named export). Use
    // process.exitCode to signal failure after a short delay so logs flush.
    setTimeout(() => {
      process.exitCode = 1;
    }, 3000);
  } else {
    console.log(res.message);
  }
}
