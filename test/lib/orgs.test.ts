import { requestsManager } from 'snyk-request-manager';
import { filterOutExistingOrgs, getAllOrgs } from '../../src/lib';
import type { CreateOrgData } from '../../src/lib/types';

const GROUP_ID = process.env.TEST_GROUP_ID as string;
const SNYK_API_TEST = process.env.SNYK_API_TEST as string;
const ORG_NAME = process.env.TEST_ORG_NAME as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('Orgs API', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });

  it('Split orgs into existing & new for a Group', async () => {
    const orgs: CreateOrgData[] = [
      {
        groupId: GROUP_ID,
        name: 'non-existing-org',
      },
      {
        groupId: GROUP_ID,
        name: ORG_NAME, // existing
      },
    ];
    const { existingOrgs, newOrgs } = await filterOutExistingOrgs(
      requestManager,
      orgs,
      GROUP_ID,
    );
    expect(existingOrgs.filter((o) => o.name === ORG_NAME)[0]).toMatchObject({
      name: ORG_NAME,
      id: expect.any(String),
      slug: expect.any(String),
      url: expect.any(String),
      group: expect.any(Object),
    });
    expect(newOrgs).toEqual([
      {
        groupId: GROUP_ID,
        name: 'non-existing-org',
      },
    ]);
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
