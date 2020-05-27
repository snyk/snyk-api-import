import * as debugLib from 'debug';
import * as path from 'path';
import { loadFile } from '../load-file';
import { importTargets, pollImportUrls } from '../lib';
import { Project, ImportTarget } from '../lib/types';
import { getLoggingPath } from '../lib/get-logging-path';
import { getConcurrentImportsNumber } from '../lib/get-concurrent-imports-number';

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
  debug(`Loaded ${targets.length} targets to import ${Date.now()}`);
  const concurrentTargets = getConcurrentImportsNumber();
  const projects: Project[] = [];
  //TODO: validation?
  const filteredTargets = await filterOutImportedTargets(targets, loggingPath);
  if (filteredTargets.length === 0) {
    return [];
  }
  for (
    let targetIndex = 0;
    targetIndex < filteredTargets.length;
    targetIndex = targetIndex + concurrentTargets
  ) {
    const batch = filteredTargets.slice(
      targetIndex,
      targetIndex + concurrentTargets,
    );
    debug(
      `Importing batch ${targetIndex} - ${targetIndex +
        concurrentTargets} out of ${filteredTargets.length}`,
    );
    const pollingUrlsAndContext = await importTargets(batch, loggingPath);
    projects.push(...(await pollImportUrls(pollingUrlsAndContext)));
  }

  return projects;
}
