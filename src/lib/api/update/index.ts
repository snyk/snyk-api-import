import 'source-map-support/register';
import * as debugLib from 'debug';
import { requestsManager } from 'snyk-request-manager';
import * as _ from 'lodash';
import { getApiToken } from '../../get-api-token';
import { Octokit } from '@octokit/rest';
import { getGithubToken } from '../../source-handlers/github/get-github-token';
import { listProjects } from '../org';

const debug = debugLib('snyk:api-update-projects');

export async function updateProjects(
  requestManager: requestsManager,
  orgId: string,
): Promise<void> {
  
  getApiToken();
  debug('Updating:', JSON.stringify({ orgId }));

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets`,
    );
  }

  // Get all the project for that target and that org
  const res = await listProjects(requestManager, orgId, undefined)

  const projects = res.projects

  for (const project of projects) {

    // GET github current default branch
    const gitHubDefaultBranch = await getDefaultBranch(project.name)

    // compare current branch with snyk branch
    if (gitHubDefaultBranch != project.branch) {

      const body = { branch: gitHubDefaultBranch } 

      // update if needed
      const url = `/orgs/${orgId.trim()}/project/${project.id}`
      await requestManager.request({
      verb: 'put',
      url: url,
      body: JSON.stringify(body),
      useRESTApi: false,
      })
    }
  }
    
}

export async function UpdateOrgs(
  requestManager: requestsManager,
  orgIds: string[],
): Promise<void> {
  
  let failed = 0;
  for (const orgId of orgIds) {
    try {
      await updateProjects(
        requestManager,
        orgId,
      );
    } catch (error) {
      failed++;
      if (failed > 0) {
        console.error(
          `Updating orgs failed`,
        );
        // die immediately
        process.exit(1);
      }
    }
  }
  return 
}

export async function getDefaultBranch (repoName: string): Promise<string> {

  const gitHubToken = getGithubToken()

  const octokit = new Octokit({
      auth: gitHubToken,
      baseUrl: "https://api.github.com/",
      Accept: "application/vnd.github+json"
  })

  const response = await octokit.request(`GET repos/${repoName}`)

  console.log("response.data: ", response.data)
  console.log(response.data.default_branch)
  console.log("response.url: ", response.url)

  return response.data.default_branch as string
}
