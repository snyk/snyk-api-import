import { requestsManager } from 'snyk-request-manager';
import { listProjects, setNotificationPreferences } from '../../src/lib';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Org notification settings', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Can change the notification settings for org', async () => {
    const res = await setNotificationPreferences(
      requestManager,
      ORG_ID,
      {
        groupId: 'exampleGroupId',
        name: 'exampleName',
      },
      {
        'test-limit': {
          enabled: false,
        },
      },
    );
    expect(res).toMatchObject({
      'test-limit': {
        enabled: false,
      },
    });
  }, 5000);
  it('Default disables all notifications', async () => {
    const res = await setNotificationPreferences(requestManager, ORG_ID, {
      groupId: 'exampleGroupId',
      name: 'exampleName',
    });
    expect(res).toEqual({
      'new-issues-remediations': {
        enabled: false,
        issueSeverity: 'high',
        issueType: 'none',
      },
      'project-imported': {
        enabled: false,
      },
      'test-limit': {
        enabled: false,
      },
      'weekly-report': {
        enabled: false,
      },
    });
  }, 5000);
});

describe('listProjects', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  it('Lists projects in a given Org', async () => {
    const res = await listProjects(requestManager, ORG_ID);
    expect(res).toMatchObject({
      org: {
        id: ORG_ID,
        name: expect.any(String),
      },
      projects: expect.any(Array),
    });
    expect(res.projects[0]).toMatchObject({
      name: expect.any(String),
      branch: expect.any(String),
    });
  });
});
