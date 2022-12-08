import * as debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';

import { find, getSCMSupportedManifests, gitClone } from '../../lib';
import type { SnykProductEntitlement } from '../../lib/supported-project-types/supported-manifests';
import type {
  RepoMetaData,
  SnykProject,
  SupportedIntegrationTypesUpdateProject,
} from '../../lib/types';
import { generateProjectDiffActions } from './generate-projects-diff-actions';

const debug = debugLib('snyk:clone-and-analyze');

const defaultExclusionGlobs = [
  'fixtures',
  'tests',
  '__tests__',
  'test',
  '__test__',
  'ci',
  'node_modules',
  'bower_components',
  '.git',
];
export async function cloneAndAnalyze(
  integrationType: SupportedIntegrationTypesUpdateProject,
  repoMetadata: RepoMetaData,
  snykMonitoredProjects: SnykProject[],
  exclusionGlobs: string[] = [],
  entitlements: SnykProductEntitlement[] = ['openSource'],
  manifestTypes?: string[],
): Promise<{
  import: string[];
  deactivate: SnykProject[];
}> {
  const { success, repoPath, gitResponse } = await gitClone(
    integrationType,
    repoMetadata,
  );
  debug('Clone response', { success, repoPath, gitResponse });

  if (!success) {
    throw new Error(gitResponse);
  }

  if (!repoPath) {
    throw new Error('No location returned for clones repo to analyze');
  }
  const { files } = await find(
    repoPath,
    [...defaultExclusionGlobs, ...exclusionGlobs],
    // TODO: when possible switch to check entitlements via API automatically for an org
    // right now the product entitlements are not exposed via API so user has to provide which products
    // they are using
    getSCMSupportedManifests(manifestTypes, entitlements),
    6,
  );
  const relativeFileNames = files.map((f) => path.relative(repoPath, f));
  debug(
    `Detected ${files.length} files in ${repoMetadata.cloneUrl}: ${files.join(
      ',',
    )}`,
  );

  fs.rmdirSync(repoPath, { recursive: true });

  return generateProjectDiffActions(
    relativeFileNames,
    snykMonitoredProjects,
    manifestTypes,
  );
}
