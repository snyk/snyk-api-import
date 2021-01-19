import { requestsManager } from 'snyk-request-manager';
import {
  importTarget,
  pollImportUrl,
  importTargets,
} from '../../src/lib';
import { Project } from '../../src/lib/types';
import { deleteTestProjects } from '../delete-test-projects';
import { generateLogsPaths } from '../generate-log-file-names';
import { deleteFiles } from '../delete-files';

const ORG_ID = process.env.TEST_ORG_ID as string;
const INTEGRATION_ID = process.env.TEST_INTEGRATION_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Single target', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = process.env.SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  it('Import & poll a repo', async () => {
    logs = Object.values(generateLogsPaths(__dirname, ORG_ID));
    const requestManager = new requestsManager({
      userAgentPrefix: 'snyk-api-import:tests',
    });
    const { pollingUrl } = await importTarget(
      requestManager,
      ORG_ID,
      INTEGRATION_ID,
      {
        name: 'ruby-with-versions',
        owner: 'snyk-fixtures',
        branch: 'master',
      },
    );
    expect(pollingUrl).not.toBeNull();
    const { projects } = await pollImportUrl(requestManager, pollingUrl);
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // cleanup
    discoveredProjects.push(...projects);
  }, 240000);
  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  });
});

describe('Multiple targets', () => {
  const discoveredProjects: Project[] = [];
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  it('importTargets & pollImportUrls multiple repos', async () => {
    logs = Object.values(generateLogsPaths(__dirname, ORG_ID));
    const requestManager = new requestsManager({
      userAgentPrefix: 'snyk-api-import:tests',
    });
    const { projects } = await importTargets(requestManager, [
      {
        orgId: ORG_ID,
        integrationId: INTEGRATION_ID,
        target: {
          name: 'ruby-with-versions',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
      {
        orgId: ORG_ID,
        integrationId: INTEGRATION_ID,
        target: {
          name: 'composer-with-vulns',
          owner: 'snyk-fixtures',
          branch: 'master',
        },
      },
    ]);
    // at least one job successfully finished
    expect(projects[0]).toMatchObject({
      projectUrl: expect.any(String),
      success: true,
      targetFile: expect.any(String),
    });
    // cleanup
    discoveredProjects.push(...projects);
  }, 240000);
  afterAll(async () => {
    await deleteTestProjects(ORG_ID, discoveredProjects);
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  });
});
