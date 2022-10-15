import debug = require("debug");
import { requestsManager } from "snyk-request-manager";
import { updateProject } from ".";

export async function compareAndUpdateBranches(
    requestManager: requestsManager,
    githubBranch: string,
    projectId: string,
    orgId: string,
    snykDefaultBranch: string,
  ): Promise<{updated: boolean}> {


    if (!projectId) {
        throw new Error(
          `Missing required parameters. Please ensure you have set: projectId.
          \nFor more information see: https://snyk.docs.apiary.io/#reference/projects/individual-project/update-a-project`,
        );
    }

    if (snykDefaultBranch != githubBranch) {

        debug(`default branch update needed for project ${projectId}\n`);
        await updateProject(requestManager, orgId, projectId, {branch: githubBranch});
        return { updated: true }

    }

    debug(`Branches are the same, no update needed for project ${projectId}\n`);

    return { updated: false }

  }