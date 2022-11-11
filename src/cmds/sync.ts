import * as debugLib from 'debug';
import * as yargs from 'yargs';
const debug = debugLib('snyk:orgs-data-script');

import { getLoggingPath } from '../lib/get-logging-path';
import type { CommandResult } from '../lib/types';
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
  // TODO: needs integration Type for GHE<> Github setup
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
};

export async function syncOrg(
  source: SupportedIntegrationTypesUpdateProject[],
  orgPublicId: string,
  sourceUrl?: string,
  dryRun?: boolean,
): Promise<CommandResult> {
  try {
    getLoggingPath();

    const res = await updateOrgTargets(orgPublicId, source, dryRun, sourceUrl);

    const nothingToUpdate =
      res.processedTargets == 0 &&
      res.meta.projects.updated.length == 0 &&
      res.meta.projects.failed.length == 0;
    const orgMessage = nothingToUpdate
      ? `Did not detect any changes to apply`
      : `Processed ${res.processedTargets} targets\nUpdated ${res.meta.projects.updated.length} projects\n${res.meta.projects.failed.length} projects failed to update\nFind more information in ${res.fileName} and ${res.failedFileName}`;

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
}): Promise<void> {
  const { source, orgPublicId, sourceUrl, dryRun } = argv;
  debug('ℹ️  Options: ' + JSON.stringify(argv));

  const sourceList: SupportedIntegrationTypesUpdateProject[] = [];
  sourceList.push(source);

  // when the input will be a file we will need to
  // add a function to read and parse the file
  const res = await syncOrg(sourceList, orgPublicId, sourceUrl, dryRun);

  if (res.exitCode === 1) {
    debug('Failed to sync organizations.\n' + res.message);

    console.error(res.message);
    setTimeout(() => yargs.exit(1, new Error(res.message)), 3000);
  } else {
    console.log(res.message);
  }
}
