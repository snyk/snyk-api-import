import * as debugLib from 'debug';
import { listProjects, getSingleProject } from '../../api/org/index';
import { requestsManager } from 'snyk-request-manager';
import { listGithubCommits } from './list-commits';
import { fetchCommitFiles } from './get-commit-files';

const debug = debugLib('snyk:github-find-changed-projects');

export async function findAndFixChangedProjects(
  requestManager: requestsManager,
  orgId: string,
  orgName: string,
): Promise<string[]> {
  const affectedProjects = [];
  const snykGHUnfilteredProjects = await listProjects(requestManager, orgId);
  const snykGHFilteredProjects = snykGHUnfilteredProjects.projects.filter(
    (project) =>
      Date.now() - Date.parse(project.lastTestedDate) >
      Date.parse(project.testFrequency),
  ); // We'll need to figure out the exact logic on how to find that the project hasn't been tested for longer than its testFrequency
  const snykProjects = [];
  for (let i = 0; i < snykGHFilteredProjects.length; i++) {
    snykProjects.push(
      await getSingleProject(
        requestManager,
        orgId,
        snykGHFilteredProjects[i].id,
      ),
    );
  }

  for (let j = 0; j < snykProjects.length; j++) {
    const commits = await listGithubCommits(
      orgName,
      snykProjects[j].name.split('/')[1].split(':')[0],
      snykProjects[j].name.split('/')[1].split(':')[1],
    );
    if (commits) {
      for (let k = 0; k < commits.length; k++) {
        const commitFiles = await fetchCommitFiles(
          orgName,
          snykProjects[j].name.split('/')[1].split(':')[0],
          commits[k].sha,
        );
        debug(`Found a changed file/project: ${snykProjects[j].name}`)
        affectedProjects.push(snykProjects[j].name);
        //TODO =>  Analize the commits files, look for previous_filename, match it to the project name and update the project name to the commit files' "filename"
      }
    }
  }
  return affectedProjects;
}
