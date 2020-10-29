import { exec } from 'child_process';
import * as path from 'path';
import { deleteFiles } from '../delete-files';
import { generateLogsPaths } from '../generate-log-file-names';
import { deleteTestProjects } from '../delete-test-projects';
import { Project } from '../../src/lib/types';
const main = './dist/index.js'.replace(/\//g, path.sep);

const ORG_ID = process.env.TEST_ORG_ID as string;

describe('`snyk-api-import import`', () => {
  let logs: string[] = [];
  const discoveredProjects: Project[] = [];
  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
  });
  afterEach(async () => {
    deleteFiles(logs);
  });
  it('Import is default command', async (done) => {
    const testRoot = __dirname + '/fixtures/single-project';
    const logFiles = generateLogsPaths(testRoot, ORG_ID);
    logs = Object.values(logFiles);

    const importFile = path.resolve(testRoot + '/import-projects-single.json');
    const logPath = path.resolve(testRoot);
    return exec(
      `node ${main}`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_IMPORT_PATH: importFile,
          SNYK_LOG_PATH: logPath,
          ORG_ID: process.env.TEST_ORG_ID
        },
      },
      (err, stdout) => {
        if (err) {
          throw err;
        }
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(`project(s)
Processed 1 out of a total of 1 targets
Check the logs for any failures located at:`);
        done();
      },
    );
  }, 240000);
  it('import triggers the API import', async (done) => {
    const testRoot = __dirname + '/fixtures';
    const logFiles = generateLogsPaths(testRoot, ORG_ID);
    logs = Object.values(logFiles);

    const importFile = path.resolve(testRoot + '/import-projects.json');
    const logPath = path.resolve(testRoot);

    return exec(
      `node ${main} import`,
      {
        env: {
          PATH: process.env.PATH,
          SNYK_TOKEN: process.env.SNYK_TOKEN_TEST,
          SNYK_API: process.env.SNYK_API_TEST,
          SNYK_IMPORT_PATH: importFile,
          SNYK_LOG_PATH: logPath,
          ORG_ID: process.env.TEST_ORG_ID
        },
      },
      (err, stdout) => {
        if (err) {
          throw err;
        }
        expect(err).toBeNull();
        expect(stdout.trim()).toMatch(`project(s)
Processed 1 out of a total of 1 targets
Check the logs for any failures located at:`);
        done();
      },
    );
  }, 240000);
});
