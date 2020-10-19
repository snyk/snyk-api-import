import { requestsManager } from 'snyk-request-manager';
import { setNotificationPreferences } from '../../src/lib/org';

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Single target', () => {
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
    const res = await setNotificationPreferences(requestManager, ORG_ID, {
      'test-limit': {
        enabled: false,
      },
    });
    expect(res).toMatchObject({
      'test-limit': {
        enabled: false,
      },
    });
  }, 3000);
  it('Default disables all notifications', async () => {
    const res = await setNotificationPreferences(requestManager, ORG_ID);
    expect(res).toEqual({
      'new-issues-remediations': {
        enabled: false,
        issueSeverity: 'high',
        issueType: 'vuln',
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
  }, 3000);
});
