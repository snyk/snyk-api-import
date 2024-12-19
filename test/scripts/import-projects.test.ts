import * as path from 'path';
import * as fs from 'fs';

import { importProjects } from '../../src/scripts/import-projects';
import { deleteTestProjects } from '../delete-test-projects';
import type { Project } from '../../src/lib/types';
import { generateLogsPaths } from '../generate-log-file-names';
import { deleteFiles } from '../delete-files';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;
const IMPORT_PROJECTS_FILE_NAME = 'import-projects.json';

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Import projects script', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  }, 30000);

  it('succeeds to import targets from file for Github', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);

    const { projects } = await importProjects(
      path.resolve(__dirname + `/fixtures/${IMPORT_PROJECTS_FILE_NAME}`),
      __dirname,
    );
    expect(projects).not.toBe([]);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 5000));
    const logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    // Github project
    expect(logFile).toMatch(
      `"target":{"name":"ruby-with-versions","owner":"api-import-circle-test","branch":"master"}`,
    );
    discoveredProjects.push(...projects);
  }, 2400000);

  it('succeeds to import Gitlab project from file', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);

    const { projects } = await importProjects(
      path.resolve(__dirname + `/fixtures/import-projects-gitlab.json`),
      __dirname,
    );

    expect(projects).not.toBe([]);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 5000));
    const logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    // Gitlab project
    expect(logFile).toMatch(
      `"target":{"name":"snyk-api-import-tool-test-org/project-from-template","branch":"main"}`,
    );
    discoveredProjects.push(...projects);
  }, 2400000);
});

describe('Import skips previously imported', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  process.env.INTEGRATION_ID = 'INTEGRATION_ID';
  process.env.ORG_ID = 'ORG_ID';

  afterAll(() => {
    jest.restoreAllMocks();
    process.env = { ...OLD_ENV };
  }, 1000);
  it('succeeds to import targets from file with import log', async () => {
    const logPath = path.resolve(__dirname + '/fixtures/with-import-log');
    const logFiles = generateLogsPaths(logPath, 'ORG_ID');

    const { projects } = await importProjects(
      path.resolve(
        __dirname + `/fixtures/with-import-log/${IMPORT_PROJECTS_FILE_NAME}`,
      ),
    );
    expect(projects.length === 0).toBeTruthy();
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 5000));
    const logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    expect(logFile).toMatch(
      'composer-with-vulns:api-import-circle-test:master',
    );
  }, 240000);
});

describe('Skips & logs issues', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  process.env.CONCURRENT_IMPORTS = '3';

  const discoveredProjects: Project[] = [];
  let logs: string[];

  afterEach(async () => {
    process.env.CONCURRENT_IMPORTS = '3';
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  }, 10000);

  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
  });
  it('Skips any badly formatted targets', async () => {
    const logRoot = __dirname + '/fixtures/invalid-target/';
    const logFiles = generateLogsPaths(logRoot, ORG_ID);
    logs = Object.values(logFiles);
    const { projects } = await importProjects(
      path.resolve(
        __dirname +
          '/fixtures/invalid-target/import-projects-invalid-target.json',
      ),
    );
    expect(projects.length === 0).toBeTruthy();
    let logFile = null;
    try {
      logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    } catch (e) {
      expect(logFile).toBeNull();
    }
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 5000));
    const failedLog = fs.readFileSync(logFiles.failedImportLogPath, 'utf8');
    expect(failedLog).toMatch('ruby-with-versions');
  }, 50000);
  it('Logs failed when API errors', async () => {
    process.env.CONCURRENT_IMPORTS = '1';
    // this folder does not exist and will be created on run
    const logRoot = __dirname + '/fixtures/failed-batch-log/';
    const logFiles = generateLogsPaths(logRoot, ORG_ID);
    logs = Object.values(logFiles);
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called.');
    });
    try {
      await importProjects(
        path.resolve(__dirname + '/fixtures/failed-batch/import-projects.json'),
      );
    } catch (e: any) {
      expect(e.message).toMatch('');
    }
    expect(exit).toHaveBeenCalledWith(1);

    let logFile = null;
    try {
      logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    } catch (e) {
      expect(logFile).toBeNull();
    }
    const failedLog = fs.readFileSync(logFiles.failedImportLogPath, 'utf8');
    expect(failedLog).toMatch('ruby-with-versions');
    // delete auto generated folder
    try {
      fs.unlinkSync(logRoot);
    } catch (e) {
      // ignore
    }
  }, 240000);
  it('Logs failed projects', async () => {
    const logRoot = __dirname + '/fixtures/projects-with-errors/';
    const logFiles = generateLogsPaths(logRoot, ORG_ID);
    logs = Object.values(logFiles);
    const { projects } = await importProjects(
      path.resolve(
        __dirname + '/fixtures/projects-with-errors/import-projects.json',
      ),
    );
    const logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    expect(logFile).not.toBeNull();
    const batchesLogFile = fs.readFileSync(
      logFiles.importedBatchesLogPath,
      'utf8',
    );
    expect(batchesLogFile).not.toBeNull();
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 5000));
    const failedProjectsLog = fs.readFileSync(
      logFiles.failedProjectsLogPath,
      'utf-8',
    );
    expect(failedProjectsLog).not.toBeNull();
    expect(failedProjectsLog).toContain(
      `"targetFile":"dotnet/invalid.csproj","success":false`,
    );

    let failedImportLog = null;
    try {
      failedImportLog = fs.readFileSync(logFiles.importLogPath, 'utf8');
    } catch (e) {
      expect(failedImportLog).toBeNull();
    }
    expect(projects.length >= 1).toBeTruthy();
    const importedJobIdsLog = fs.readFileSync(
      logFiles.importJobIdsLogsPath,
      'utf8',
    );
    expect(importedJobIdsLog).not.toBeNull();
    const importedProjectsLog = fs.readFileSync(
      logFiles.importedProjectsLogPath,
      'utf8',
    );
    expect(importedProjectsLog).not.toBeNull();
    discoveredProjects.push(...projects);
  }, 500000);
});

describe('Error handling', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  process.env.SNYK_LOG_PATH = __dirname;

  afterAll(async () => {
    process.env = { ...OLD_ENV };
  }, 10000);

  it('shows correct error when input can not be loaded', async () => {
    expect(
      importProjects(`do-not-exist/${IMPORT_PROJECTS_FILE_NAME}`),
    ).rejects.toThrow('File can not be found at location');
  }, 300);
  it('shows correct error when input is invalid json', async () => {
    const file = path.resolve(
      __dirname + '/fixtures/import-projects-invalid.json',
    );
    expect(importProjects(file)).rejects.toThrow(
      'Could not find "targets" key in json. Make sure the JSON is valid and the key is present',
    );
  }, 300);

  it('shows correct error when SNYK_LOG_PATH is not set', async () => {
    delete process.env.SNYK_LOG_PATH;
    expect(
      importProjects(
        path.resolve(
          __dirname +
            '/fixtures/invalid-target/import-projects-invalid-target.json',
        ),
      ),
    ).rejects.toThrow('Please set the SNYK_LOG_PATH e.g. export SNYK_LOG_PATH');
  }, 300);
});

describe('No projects scenarios', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  afterEach(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  }, 30000);
  it('succeeds to complete import targets from empty repo', async () => {
    const testName = 'empty-target';
    const logPath = path.resolve(__dirname + '/fixtures/' + testName);
    const logFiles = generateLogsPaths(logPath, ORG_ID);
    logs = Object.values(logFiles);
    process.env.SNYK_LOG_PATH = logPath;

    const { projects } = await importProjects(
      path.resolve(
        __dirname + `/fixtures/${testName}/${IMPORT_PROJECTS_FILE_NAME}`,
      ),
    );
    expect(projects.length === 0).toBeTruthy();
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 30000));
    const logFile = fs.readFileSync(logFiles.importJobsLogPath, 'utf8');
    expect(logFile).toMatch(`"status":"complete","projects":[]}`);
    expect(logFile).toMatch(
      `"logs":[{"name":"api-import-circle-test/empty-repo"`,
    );
  }, 3000000);

  it('succeeds to complete import from repo with no supported manifests', async () => {
    const testName = 'no-supported-manifests';
    const logPath = path.resolve(__dirname + '/fixtures/' + testName);
    const logFiles = generateLogsPaths(logPath, ORG_ID);
    logs = Object.values(logFiles);
    process.env.SNYK_LOG_PATH = logPath;

    const { projects } = await importProjects(
      path.resolve(
        __dirname + `/fixtures/${testName}/${IMPORT_PROJECTS_FILE_NAME}`,
      ),
    );
    expect(projects.length === 0).toBeTruthy();

    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 5000));
    const logFile = fs.readFileSync(logFiles.importJobsLogPath, 'utf8');
    expect(logFile).toMatch(`"status":"complete","projects":[]}`);
    expect(logFile).toMatch(
      `"logs":[{"name":"api-import-circle-test/no-supported-manifests"`,
    );
  }, 300000);
});
