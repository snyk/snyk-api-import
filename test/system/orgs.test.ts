import { requestsManager } from 'snyk-request-manager';
import { listTargets } from '../../src/lib';

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

const ORG_ID = process.env.TEST_ORG_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

describe('listTargets', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  }, 1000);
  it('list the targets in a given Org - e2e', async () => {
    const res = await listTargets(requestManager, ORG_ID);
    expect(res).toMatchObject({
      targets: expect.any(Array),
    });

    expect(res.targets[0]).toMatchObject({
      attributes: expect.any(Object),
      id: expect.any(String),
      relationships: expect.any(Object),
      type: 'target',
    });
  }, 5000);
});
