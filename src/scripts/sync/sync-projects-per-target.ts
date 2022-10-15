import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { getGithubReposDefaultBranch } from '../../lib/source-handlers/github';
import { compareAndUpdateBranches } from '../../lib/project/compare-branches';
import {
  SnykProject,
  SupportedIntegrationTypesUpdateProject,
  Target,
} from '../../lib/types';
import { targetGenerators } from '../generate-imported-targets-from-snyk';
const debug = debugLib('snyk:sync-projects-per-target');

export function getBranchGenerator(
  origin: SupportedIntegrationTypesUpdateProject,
): (target: Target, host?: string | undefined) => Promise<string> {
  const getDefaultBranchGenerators = {
    [SupportedIntegrationTypesUpdateProject.GITHUB]: getGithubReposDefaultBranch,
  };
  return getDefaultBranchGenerators[origin];
}

export async function updateProjectPerTarget(
  requestManager: requestsManager,
  orgId: string,
  project: SnykProject,
): Promise<{ updated: boolean }> {
  let defaultBranch;
  const origin = project.origin as SupportedIntegrationTypesUpdateProject;

  try {
    const target = targetGenerators[origin](project);
    defaultBranch = await getBranchGenerator(origin)(target);
    // defaultBranch = await getGithubReposDefaultBranch(target);
  } catch (e) {
    debug(`ERROR: ${e}`);
    throw new Error(`Getting default branch failed with error: ${e.message}`);
  }

  const { updated } = await compareAndUpdateBranches(
    requestManager,
    {
      branch: project.branch!,
      projectPublicId: project.id,
    },
    defaultBranch,
    orgId,
  );

  return { updated };
}
