import * as fs from 'fs';
import { requestsManager } from 'snyk-request-manager';
import { importSingleTarget } from '../../../src/scripts/sync/import-target';
import { SupportedIntegrationTypesUpdateProject } from '../../../src/lib/types';
import type { Project } from '../../../src/lib/types';
import { deleteFiles } from '../../delete-files';
import { deleteTestProjects } from '../../delete-test-projects';
import { generateLogsPaths } from '../../generate-log-file-names';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Import projects script', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  }, 10000);

  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });

  it('succeeds to import a single target', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);

    const target = {
      name: 'ruby-with-versions',
      owner: 'api-import-circle-test',
      branch: 'master',
    };

    const { projects } = await importSingleTarget(
      requestManager,
      ORG_ID,
      SupportedIntegrationTypesUpdateProject.GHE,
      target,
    );
    expect(projects).not.toBe([]);
    expect(projects.length).toEqual(1);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    const logFile = fs.readFileSync(logFiles.importLogPath, 'utf8');
    expect(logFile).toMatch(
      `"target":{"name":"ruby-with-versions","owner":"api-import-circle-test","branch":"master"}`,
    );
    discoveredProjects.push(...projects);
  }, 2400000);
  it('exclusions propagate to API and apply as expected', async () => {
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);

    const target = {
      name: 'ruby-with-versions',
      owner: 'api-import-circle-test',
      branch: 'master',
    };

    const { projects } = await importSingleTarget(
      requestManager,
      ORG_ID,
      SupportedIntegrationTypesUpdateProject.GHE,
      target,
      undefined,
      'ruby-2.5.3-exactly',
    );
    expect(projects).toHaveLength(0);
  }, 2400000);
  it.todo('imports an individual file only if asked');
});
