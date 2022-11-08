import type { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';

import { getGithubReposDefaultBranch } from '../../lib/source-handlers/github';
import { updateBranch } from '../../lib/project/update-branch';
import type {
  SnykProject, Target,
} from '../../lib/types';
import {
  SupportedIntegrationTypesUpdateProject,
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

export async function updateProjectForTarget(
  requestManager: requestsManager,
  orgId: string,
  project: SnykProject,
  dryRun = false, // TODO: add a test for this function + this param
): Promise<{ updated: boolean }> {
  let defaultBranch;
  const origin = project.origin as SupportedIntegrationTypesUpdateProject;

  try {
    const target = targetGenerators[origin](project);
    defaultBranch = await getBranchGenerator(origin)(target);
  } catch (e) {
    debug(`Getting default branch failed with error: ${e}`);
  }

  if (!defaultBranch) {
    return { updated: false };
  }

  const { updated } = await updateBranch(
    requestManager,
    {
      branch: project.branch!,
      projectPublicId: project.id,
    },
    defaultBranch,
    orgId,
    dryRun,
  );

  return { updated };
}
