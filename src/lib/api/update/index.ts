import 'source-map-support/register';
import * as debugLib from 'debug';
import { requestsManager } from 'snyk-request-manager';
import * as _ from 'lodash';
import { getApiToken } from '../../get-api-token';
import { Octokit } from '@octokit/rest';
import { getGithubToken } from '../../source-handlers/github/get-github-token';
import axios from 'axios';
import { SnykProject } from '../../types';

const debug = debugLib('snyk:api-update-projects');


export async function makeSnykRequest (url: string, method: string, body: any): Promise<any> {

  const token = process.env.SNYK_TOKEN
  const urlFull = 'http://localhost:8000/api/v1/' + url
  try {
    // 👇️ const response: Response
    const config = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `token ${token}`,
      }
    }

    let response
    if (method === "post") {
      response = await axios.post(urlFull, body, config);
    } else if (method === "get") {
      response = await axios.get(urlFull, config)
    } else if (method === "put") {
      response = await axios.put(urlFull, body, config)
    }
    
    return response?.data;
  } catch (error) {
    if (error instanceof Error) {
      console.log('error message: ', error.message);
      console.log('error message: ', error);
      return error.message;
    } else {
      console.log('unexpected error: ', error);
      return 'An unexpected error occurred';
    }
  }
}

export async function updateProjects(
  requestManager: requestsManager,
  orgId: string,
): Promise<void> {
  
  console.log('updateProject')
  getApiToken();
  debug('Updating:', JSON.stringify({ orgId }));

  if (!orgId) {
    throw new Error(
      `Missing required parameters. Please ensure you have set: orgId.
      \nFor more information see: https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets`,
    );
  }

  // Get all the project for that target and that org
  const res = await makeSnykRequest(`org/${orgId.trim()}/projects`, "get", {})
  const projects = res.projects

  for (const project of projects) {

   

    // GET github current default branch

    let projectNameToUse = project.name
    if (project.name.includes(':')) {
        // removing the target file
        projectNameToUse = project.name.split(':')[0]
    }

    console.log("projectNameToUse ", projectNameToUse)

    const gitHubDefaultBranch = await getDefaultBranch(projectNameToUse)
    console.log("gitHubDefaultBranch ", gitHubDefaultBranch)

    // compare current branch with snyk branch
    if (gitHubDefaultBranch != project.branch) {

      const body = { branch: gitHubDefaultBranch } 
      console.log("update is needed")

      // update if needed
      const url = `org/${orgId.trim()}/project/${project.id}`
      await makeSnykRequest(url, "put", JSON.stringify(body))
      // await requestManager.request({
      // verb: 'put',
      // url: url,
      // body: JSON.stringify(body),
      // useRESTApi: false,
      // })
    } else {
      console.log("nothing to do")
    }
  }
    
}

export async function UpdateOrgs(
  requestManager: requestsManager,
  orgIds: string[],
): Promise<void> {
  
  console.log("updateOrgs")
  let failed = 0;
  for (const orgId of orgIds) {
    console.log(orgId)
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

  console.log("getDefaultBranch")
  const gitHubToken = getGithubToken()

  const octokit = new Octokit({
      auth: gitHubToken,
      baseUrl: "https://api.github.com/",
      Accept: "application/vnd.github+json"
  })

  let response

  try {
    response = await octokit.request(`GET repos/${repoName}`)
    console.log("response: ", response)
    console.log("response.data: ", response.data)
    console.log(response.data.default_branch)
    console.log("response.url: ", response.url)

    return response.data.default_branch as string
  } catch (e) {
    console.log(e)
    throw new Error('failed to get github branch')
  }  
}
