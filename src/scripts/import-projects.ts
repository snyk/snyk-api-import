import * as debugLib from 'debug';

import { loadFile } from '../load-file';
import { importTargets, pollImportUrls } from '../lib';
import { Project } from '../lib/types';

const debug = debugLib('snyk:import-projects-script');

export async function ImportProjects(
  fileName: string,
): Promise<Project[]> {
  const content = await loadFile(fileName);
  const targets = [];
  try {
    targets.push(...JSON.parse(content).targets);
  } catch (e) {
    throw new Error(`Failed to parse targets from ${fileName}`);
  }
  debug(`Loaded ${targets.length} targets to import`);
  //TODO: validation?
  const pollingUrls = await importTargets(targets);
  const importJobs = await pollImportUrls(pollingUrls);

  const projects: Project[] = [];
  importJobs.forEach((job) => {
    job.logs.forEach(log => {
      projects.push(...log.projects);
    })
  });


  return projects;
}
