import * as debugLib from 'debug';
import * as yargs from 'yargs';
const debug = debugLib('snyk:sync-cmd');

import { getLoggingPath } from '../lib/get-logging-path';
import type { SnykProductEntitlement } from '../lib/supported-project-types/supported-manifests';
import { CommandResult, productEntitlements } from '../lib/types';
import { SupportedProductsUpdateProject } from '../lib/types';

import { SupportedIntegrationTypesUpdateProject } from '../lib/types';

import { updateOrgTargets } from '../scripts/sync/sync-org-projects';

export const command = ['sync'];
export const desc =
  'Sync targets (e.g. repos) and their projects between Snyk and SCM for a given organization. Actions include:\n - updating monitored branch in Snyk to match the default branch from SCM';
export const builder = {
  orgPublicId: {
    required: true,
    default: undefined,
    desc: 'Public id of the organization in Snyk that will be updated',
  },
  sourceUrl: {
    required: false,
    default: undefined,
    desc: 'Custom base url for the source API that can list organizations (e.g. Github Enterprise url)',
  },
  source: {
    required: true,
    default: SupportedIntegrationTypesUpdateProject.GITHUB,
    choices: [...Object.values(SupportedIntegrationTypesUpdateProject)],
    desc: 'List of sources to be synced e.g. Github, Github Enterprise, Gitlab, Bitbucket Server, Bitbucket Cloud',
  },
  dryRun: {
    required: false,
    default: false,
    desc: 'Dry run option. Will create a log file listing the potential updates',
  },
  snykProduct: {
    required: false,
    default: SupportedProductsUpdateProject.OPEN_SOURCE,
    choices: [...Object.values(SupportedProductsUpdateProject)],
    desc: 'List of Snyk Products to consider when syncing an SCM repo for deleting projects & importing new ones (default branch will be updated for all projects in a target). Monitored Snyk Code repos are automatically synced already, if Snyk Code is enabled any new repo imports will bring in Snyk Code projects',
  },
};

export async function syncOrg(
  source: SupportedIntegrationTypesUpdateProject[],
  orgPublicId: string,
  sourceUrl?: string,
  dryRun?: boolean,
  entitlements: SnykProductEntitlement[] = [],
  manifestTypes?: string[],
): Promise<CommandResult> {
  try {
    getLoggingPath();

    const res = await updateOrgTargets(
      orgPublicId,
      source,
      dryRun,
      sourceUrl,
      entitlements,
      manifestTypes,
    );

    const nothingToUpdate =
      res.processedTargets == 0 &&
      res.meta.projects.updated.length == 0 &&
      res.meta.projects.failed.length == 0;
    const orgMessage = nothingToUpdate
      ? `Did not detect any changes to apply`
      : `Processed ${res.processedTargets} targets (${
          res.failedTargets
        } failed)\nUpdated ${
          res.meta.projects.updated.length
        } projects\nFind more information in ${res.fileName}${
          res.failedFileName ? ` and ${res.failedFileName}` : ''
        }`;

    return {
      fileName: res.fileName,
      exitCode: 0,
      message:
        `Finished syncing all ${source} targets for Snyk organization ${orgPublicId}\n` +
        orgMessage,
    };
  } catch (e) {
    const errorMessage = `ERROR! Failed to sync organization. Try running with \`DEBUG=snyk* <command> for more info\`.\nERROR: ${e.message}`;
    return {
      fileName: undefined,
      exitCode: 1,
      message: errorMessage,
    };
  }
}

export async function handler(argv: {
  source: SupportedIntegrationTypesUpdateProject;
  orgPublicId: string;
  sourceUrl?: string;
  dryRun?: boolean;
  snykProduct?: SupportedProductsUpdateProject[];
}): Promise<void> {
  const {
    source,
    orgPublicId,
    sourceUrl,
    dryRun,
    snykProduct = [SupportedProductsUpdateProject.OPEN_SOURCE],
  } = argv;
  debug('ℹ️  Options: ' + JSON.stringify(argv));

  const sourceList: SupportedIntegrationTypesUpdateProject[] = [];
  sourceList.push(source);

  const manifestTypes: string[] = [];
  const entitlements: SnykProductEntitlement[] = [];

  const products = Array.isArray(snykProduct) ? snykProduct : [snykProduct];
  for (const p of products) {
    entitlements.push(productEntitlements[p]);
  }
  console.log(
    `ℹ️  Running sync for ${source} projects in org: ${orgPublicId} (products to be synced: ${products.join(
      ',',
    )})`,
  );

  // when the input will be a file we will need to
  // add a function to read and parse the file
  const res = await syncOrg(
    sourceList,
    orgPublicId,
    sourceUrl,
    dryRun,
    entitlements,
    manifestTypes,
  );

  if (res.exitCode === 1) {
    debug('Failed to sync organizations.\n' + res.message);

    console.error(res.message);
    setTimeout(() => yargs.exit(1, new Error(res.message)), 3000);
  } else {
    console.log(res.message);
  }
}
