import {
  importTarget,
  pollImportUrl,
  importTargets,
  pollImportUrls,
} from '../../src/lib';
import { Project } from '../../src/lib/types';
import { deleteTestProjects } from '../delete-test-projects';
import { generateLogsPaths } from '../generate-log-file-names';
import { deleteLogs } from '../delete-logs';

const ORG_ID = 'f0125d9b-271a-4b50-ad23-80e12575a1bf';
const GITHUB_INTEGRATION_ID = 'c4de291b-e083-4c43-a72c-113463e0d268';
const SNYK_API_TEST = 'https://dev.snyk.io/api/v1';

describe('Single target', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  it('Import & poll a repo', async () => {
    logs = Object.values(generateLogsPaths(__dirname, ORG_ID));
    const { pollingUrl } = await importTarget(ORG_ID, GITHUB_INTEGRATION_ID, {
      name: 'ruby-with-versions',
      owner: 'snyk-fixtures',
      branch: 'master',
    });
    expect(pollingUrl).not.toBeNull();
    const projects = await pollImportUrl(pollingUrl);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // cleanup
    discoveredProjects.push(...projects);
  }, 30000000);
  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteLogs(logs);
    process.env = { ...OLD_ENV };
  });
});

describe('Multiple targets', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  it('importTargets &  pollImportUrls multiple repos', async () => {
    logs = Object.values(generateLogsPaths(__dirname, ORG_ID));
    const pollingUrls = await importTargets([
      {
        orgId: ORG_ID,
        integrationId: GITHUB_INTEGRATION_ID,
        target: {
          name: 'ruby-with-versions',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
      {
        orgId: ORG_ID,
        integrationId: GITHUB_INTEGRATION_ID,
        target: {
          name: 'composer-with-vulns',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
    ]);
    expect(pollingUrls.length >= 1).toBeTruthy();
    const projects = await pollImportUrls(pollingUrls);
    // at least one job successfully finished
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // cleanup
    discoveredProjects.push(...projects);
  }, 30000000);
  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteLogs(logs);
    process.env = { ...OLD_ENV };
  });
});

test.todo('Failed import 100%');

test.todo('Import stops after 1 100% failed batch');

test.todo('Only 1 import fails out of a few + logs created');

describe('Polling', () => {
  it.todo('Logs failed polls');
});
