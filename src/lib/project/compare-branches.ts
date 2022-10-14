import debug = require("debug");
import type { requestsManager } from "snyk-request-manager";
import { updateProject } from "../api/project";

export async function compareAndUpdateBranches(
  requestManager: requestsManager,
  snykDefaultBranch: string,
  githubBranch: string,
  projectId: string,
  orgId: string,
): Promise<{ projectUpdated: boolean }> {

  let projectUpdated = false
  try {

    if (snykDefaultBranch != githubBranch) {
      debug(`default branch update needed for project ${projectId}\n`);

      await updateProject(requestManager, orgId, projectId, { branch: githubBranch });
      projectUpdated = true
    }

    return { projectUpdated }
  } catch (e) {
    throw new Error(
      `Failed to update project ${projectId}. ERROR: ${e.message}`,
    );
  }
}
