import debug from 'debug';
import type { requestsManager } from 'snyk-request-manager';
import { updateProject } from '../api/project';

export async function updateBranch(
  requestManager: requestsManager,
  project: {
    branch: string;
    projectPublicId: string;
  },
  defaultBranch: string,
  orgId: string,
  dryRun = false,
): Promise<{ updated: boolean }> {
  const { branch, projectPublicId } = project;
  let updated = false;
  try {
    // If we couldn't determine a default branch (empty string), do not
    // update the project's branch in Snyk. This avoids accidentally
    // clearing existing branch information when analysis failed or when
    // the SCM probe couldn't resolve the default branch.
    if (!defaultBranch || defaultBranch.trim() === '') {
      debug(
        `Detected empty default branch for project ${projectPublicId}; skipping update`,
      );
      return { updated };
    }

    if (branch != defaultBranch) {
      debug(`Default branch has changed for Snyk project ${projectPublicId}`);
      if (!dryRun) {
        await updateProject(requestManager, orgId, project.projectPublicId, {
          branch: defaultBranch,
        });
      } else {
        debug(`Skipping API call to change branch in --dryRun mode`);
      }
      updated = true;
    } else {
      debug(`Default branch has not changed`);
    }
    return { updated };
  } catch (e) {
    throw new Error(
      `Failed to update project ${projectPublicId} via Snyk API. ERROR: ${e.message}`,
    );
  }
}
