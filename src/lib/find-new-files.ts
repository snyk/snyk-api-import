import * as fs from 'fs';
import * as debugLib from 'debug';
import { requestsManager } from 'snyk-request-manager';
import { listProjects } from './api/org';

const debug = debugLib('snyk:find-new-files');

// For this spike, we look for Nuget files
const isSCMSupported = [
  'packages.config',
  '*.csproj',
  '*.fsproj',
  '*.vbproj',
  'project.json',
  'project.assets.json',
  '*.targets',
  '*.props',
  'packages*.lock.json',
  'global.json',
];

function getAllFiles(
  dirPath: string,
  basePath: string,
  arrayOfFiles?: string[],
): string[] {
  debug(`Reading all files from ${dirPath}`);
  const files = fs.readdirSync(dirPath);
  debug(`Found ${files.length} files`);

  arrayOfFiles = arrayOfFiles?.length ? arrayOfFiles : [];
  debug('Excluding existing projects from list of files');

  for (let i = 0; i < files.length; i++) {
    if (fs.statSync(dirPath + '/' + files[i]).isDirectory()) {
      arrayOfFiles = getAllFiles(
        dirPath + '/' + files[i],
        basePath,
        arrayOfFiles,
      );
    } else {
      if (isSCMSupported.includes(files[i])) {
        arrayOfFiles.push(
          `${dirPath}/${files[i]}`.replace(basePath, '').substring(1),
        );
      }
    }
  }
  return arrayOfFiles;
}

function deleteClonedRepo(path: string): boolean {
  debug(`Trying to delete the cloned repo: ${path}`);
  try {
    fs.rmdirSync(path, { recursive: true });
    return true;
  } catch (err) {
    debug(`Could not delete repo:, ${err}`);
    return false;
  }
}

async function filterExistingProjects(
  files: string[],
  projects: string[],
): Promise<string[]> {
  const filtered = files.filter((el) => {
    return projects.indexOf(el) === -1;
  });
  return filtered;
}

export async function findSupportedFiles(
  path: string,
  requestsManager: requestsManager,
  orgId: string,
): Promise<string[]> {
  const projectsNames: string[] = [];
  const allFilesInRepo = getAllFiles(path, path);
  debug(
    `Found ${allFilesInRepo.length} supported files in ${path}\n Fetching Snyk Projects`,
  );

  const snykProjects = await listProjects(requestsManager, orgId);
  debug(`Found ${snykProjects.projects.length} Snyk Projects`);

  for (let i = 0; i < snykProjects.projects.length; i++) {
    projectsNames.push(snykProjects.projects[i].name);
  }
  const filesForImport = await filterExistingProjects(
    allFilesInRepo,
    projectsNames,
  );
  if (filesForImport.length) {
    debug(`These files will be added to the import list: ${filesForImport}`);
    deleteClonedRepo(path);
  } else {
    debug('No files were marked for import');
  }
  return filesForImport;
}
