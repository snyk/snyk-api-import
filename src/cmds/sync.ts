import debugLib from 'debug';
// yargs not used here after bundler-friendly exit handling
const debug = debugLib('snyk:sync-cmd');

import { getLoggingPath } from '../lib/get-logging-path';
import type { SnykProductEntitlement } from '../lib/supported-project-types/supported-manifests';
import type { CommandResult, SyncTargetsConfig } from '../lib/types';
import { productEntitlements } from '../lib/types';
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
  exclusionGlobs: {
    required: false,
    default: undefined,
    desc: 'Comma separated list of glob patterns to prevent matching files from being in Snyk. This will refuse to import new files matching the patterns and de-activate existing projects that match these files.',
  },
};

export async function syncOrg(
  source: SupportedIntegrationTypesUpdateProject[],
  orgPublicId: string,
  sourceUrl: string | undefined,
  config: SyncTargetsConfig = {
    dryRun: false,
    entitlements: ['openSource'],
    // TODO: expose manifest types to allow syncing only some projects
  },
): Promise<CommandResult> {
  try {
    getLoggingPath();

    const res = await updateOrgTargets(orgPublicId, source, sourceUrl, config);

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
  exclusionGlobs?: string | string[];
}): Promise<void> {
  const {
    source,
    orgPublicId,
    sourceUrl,
    // prefer explicit camelCase but also accept legacy/lowercase `--dryrun`
    snykProduct = [SupportedProductsUpdateProject.OPEN_SOURCE],
    exclusionGlobs,
  } = argv as any;
  // Normalize dryRun so that an explicit flag wins regardless of builder default.
  // Yargs may populate both camelCase and dashed/lowercase variants and also
  // initialize the camelCase with the builder default (false). Use strict
  // checks for `=== true` so an explicit `--dryrun` (or --dry-run) will be
  // honored even when argv.dryRun exists and is the default false.
  const rawArgv = argv as any;
  const parseBool = (v: unknown) => {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      const s = v.toLowerCase().trim();
      return s === 'true' || s === '1';
    }
    return false;
  };
  const dryRun: boolean =
    parseBool(rawArgv.dryRun) ||
    parseBool(rawArgv.dryrun) ||
    parseBool(rawArgv['dry-run']);
  // Log the normalized value so users can verify which form was picked up
  console.log(
    `ℹ️  Resolved dryRun=${dryRun} (argv.dryRun=${String(
      (rawArgv as any).dryRun,
    )}, argv.dryrun=${String(
      (rawArgv as any).dryrun,
    )}, argv['dry-run']=${String((rawArgv as any)['dry-run'])})`,
  );
  debug('ℹ️  Options: ' + JSON.stringify(argv));

  if (Array.isArray(source)) {
    throw new Error(
      'Please provide a single value for --source. Multiple sources processing is not supported.',
    );
  }
  const sourceList: SupportedIntegrationTypesUpdateProject[] = [];
  sourceList.push(source);

  const manifestTypes: string[] = []; // TODO: let users provide this
  const entitlements: SnykProductEntitlement[] = [];
  const exclusions: string[] = [];

  if (exclusionGlobs) {
    exclusions.push(
      ...(Array.isArray(exclusionGlobs)
        ? exclusionGlobs.join(',').split(',')
        : exclusionGlobs.split(',')),
    );
  }

  const products = Array.isArray(snykProduct) ? snykProduct : [snykProduct];
  for (const p of products) {
    // ensure correct enum typing for indexing productEntitlements
    entitlements.push(productEntitlements[p as SupportedProductsUpdateProject]);
  }
  console.log(
    `ℹ️  Running sync for ${source} projects in org: ${orgPublicId} (products to be synced: ${products.join(
      ',',
    )})`,
  );

  const res = await syncOrg(sourceList, orgPublicId, sourceUrl, {
    dryRun,
    entitlements,
    manifestTypes,
    exclusionGlobs: exclusions,
  });

  if (res.exitCode === 1) {
    debug('Failed to sync organizations.\n' + res.message);

    console.error(res.message);
    // Avoid yargs.exit - use process.exitCode after a short delay to allow
    // logs to flush and avoid bundler warnings about named exports.
    setTimeout(() => {
      process.exitCode = 1;
    }, 3000);
  } else {
    console.log(res.message);
  }
}
