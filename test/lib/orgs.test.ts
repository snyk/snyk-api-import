import { requestsManager } from 'snyk-request-manager';
import { getAllOrgs, listAllOrgsTokenBelongsTo } from '../../src/lib';

const GROUP_ID = process.env.TEST_GROUP_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Orgs API', () => {
  const OLD_ENV = process.env;
  process.env.GROUP_;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });
  it('Lists all Orgs a token belongs to', async () => {
    const res = await listAllOrgsTokenBelongsTo(requestManager);
    expect(res).toMatchObject({
      orgs: expect.any(Array),
    });
    expect(res.orgs.filter((org) => org.group)[0]).toMatchObject({
      name: expect.any(String),
      id: expect.any(String),
      slug: expect.any(String),
      url: expect.any(String),
      group: {
        name: expect.any(String),
        id: expect.any(String),
      },
    });
  });

  it('Get all orgs for GROUP', async () => {
    const orgs = await getAllOrgs(requestManager, GROUP_ID);

    expect(orgs).toMatchObject(expect.any(Array));
    expect(orgs[0]).toMatchObject({
      name: expect.any(String),
      id: expect.any(String),
      slug: expect.any(String),
      url: expect.any(String),
      group: {
        name: expect.any(String),
        id: expect.any(String),
      },
    });
    expect(orgs.every((org) => org.group.id === GROUP_ID)).toBeTruthy();
  }, 20000);
});
