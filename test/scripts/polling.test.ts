import * as path from 'path';
import * as fs from 'fs';
jest.mock('snyk-request-manager');

import { importProjects } from '../../src/scripts/import-projects';
import { deleteTestProjects } from '../delete-test-projects';
import type { Project } from '../../src/lib/types';
import { generateLogsPaths } from '../generate-log-file-names';
import { deleteFiles } from '../delete-files';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;
const IMPORT_PROJECTS_FILE_NAME = 'import-projects.json';

describe('Logs failed polls', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Fails to import targets from file', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);
    const failedPollsLogName = path.join(__dirname, 'ORG-ID.failed-polls.log');
    logs.push(failedPollsLogName);

    const { projects } = await importProjects(
      path.resolve(__dirname + `/fixtures/${IMPORT_PROJECTS_FILE_NAME}`),
      __dirname,
    );
    expect(projects).toStrictEqual([]);
    let logFile = null;
    try {
      logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    } catch (e) {
      expect(logFile).toBeNull();
    }
    await new Promise((r) => setTimeout(r, 300));
    const failedLog = fs.readFileSync(failedPollsLogName, 'utf8');
    expect(failedLog).toMatch(
      `"level":50,"orgId":"ORG-ID","locationUrl":"https://app.snyk.io/api/v1/org/ORG-ID/integrations/INTEGRATION-ID/import/IMPORT-ID","errorMessage":{"statusCode":500,"error":{"message":"Error calling Snyk api"}},"msg":"Failed to poll url"`,
    );
  }, 240000);
});
