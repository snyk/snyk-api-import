import debug = require('debug');
import { requestsManager } from 'snyk-request-manager';
import { updateProject } from '../api/project';

export async function compareAndUpdateBranches(
  requestManager: requestsManager,
  project: {
    branch: string;
    projectPublicId: string;
  },
  defaultBranch: string,
  orgId: string,
): Promise<{ updated: boolean }> {
  let updated = false;
  try {
    if (project.branch != defaultBranch) {
      debug(
        `default branch update needed for project ${project.projectPublicId}\n`,
      );

      await updateProject(requestManager, orgId, project.projectPublicId, {
        branch: defaultBranch,
      });
      updated = true;
    }

    return { updated };
  } catch (e) {
    throw new Error(
      `Failed to update project ${project.projectPublicId}. ERROR: ${e.message}`,
    );
  }
}
