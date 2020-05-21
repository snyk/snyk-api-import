import * as debugLib from 'debug';
import * as path from 'path';
import { loadFile } from '../load-file';
import { importTargets, pollImportUrls } from '../lib';
import { Project, ImportTarget } from '../lib/types';
import { getLoggingPath } from '../lib/get-logging-path';

const debug = debugLib('snyk:import-projects-script');

const regexForTarget = (target: string): RegExp =>
  new RegExp(`(,?)${target}.*,`, 'm');

async function filterOutImportedTargets(
  targets: ImportTarget[],
  loggingPath: string,
): Promise<ImportTarget[]> {
  let logFile: string;
  const filterOutImportedTargets: ImportTarget[] = [];
  try {
    logFile = await loadFile(path.resolve(loggingPath, 'imported-targets.log'));
  } catch (e) {
    return targets;
  }
  targets.forEach((targetItem) => {
    const { orgId, integrationId, target } = targetItem;
    const data = `${orgId}:${integrationId}:${Object.values(target).join(':')}`;
    const targetRegExp = regexForTarget(data);
    const match = logFile.match(targetRegExp);
    if (!match) {
      filterOutImportedTargets.push(targetItem);
    } else {
      debug('Dropped previously imported target: ', JSON.stringify(targetItem));
    }
  });

  return filterOutImportedTargets;
}

export async function ImportProjects(
  fileName: string,
  loggingPath: string = getLoggingPath(),
): Promise<Project[]> {
  const content = await loadFile(fileName);
  const targets: ImportTarget[] = [];
  try {
    targets.push(...JSON.parse(content).targets);
  } catch (e) {
    throw new Error(`Failed to parse targets from ${fileName}`);
  }
  debug(`Loaded ${targets.length} targets to import`);
  //TODO: validation?
  const filteredTargets = await filterOutImportedTargets(targets, loggingPath);
  const pollingUrls = await importTargets(filteredTargets, loggingPath);
  const projects = await pollImportUrls(pollingUrls);

  return projects;
}
