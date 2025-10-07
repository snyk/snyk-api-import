import { vol } from 'memfs';
import { createOrgs } from '../../src/scripts/create-orgs';
import { CREATED_ORG_LOG_NAME } from '../../src/common';

jest.mock('fs', () => require('memfs').fs);

const ORG_NAME = 'snyk-api-import-hello';
const GROUP_ID = 'test-group-id';

describe('createOrgs script', () => {
  beforeAll(() => {
    process.env.SNYK_API = 'test-api';
    process.env.SNYK_TOKEN = 'test-token';
    process.env.TEST_ORG_NAME = ORG_NAME;
    process.env.TEST_GROUP_ID = GROUP_ID;
  });

  afterAll(() => vol.reset());

  // too flaky to run every time
  it('create 1 org', async () => {
    // Minimal in-memory fixture
    vol.fromJSON({
      '/fixtures/create-orgs/1-org/1-org.json': JSON.stringify({
        orgs: [{ name: ORG_NAME, groupId: GROUP_ID }],
      }),
    });
    const importFile = '/fixtures/create-orgs/1-org/1-org.json';
    const logPath = '/fixtures/create-orgs/1-org/';
    process.env.SNYK_LOG_PATH = logPath;

    const { fileName, orgs, existing } = await createOrgs(importFile);
    expect(orgs).not.toBeNull();
    expect(orgs[0]).toHaveProperty('name', ORG_NAME);
    expect(existing.length).toBeGreaterThanOrEqual(0);
    const logFile = vol.readFileSync(`${logPath}/${fileName}`, 'utf8');
    expect(logFile).toContain(ORG_NAME);
  }, 10000);
  it('create 1 org and do not list existing', async () => {
    vol.fromJSON({
      '/fixtures/create-orgs/1-org/1-org.json': JSON.stringify({
        orgs: [{ name: ORG_NAME, groupId: GROUP_ID }],
      }),
    });
    const importFile = '/fixtures/create-orgs/1-org/1-org.json';
    const logPath = '/fixtures/create-orgs/1-org/';
    process.env.SNYK_LOG_PATH = logPath;

    const { fileName, orgs, existing } = await createOrgs(importFile, {
      includeExistingOrgsInOutput: false,
    });
    expect(orgs).not.toBeNull();
    expect(orgs[0]).toHaveProperty('name', ORG_NAME);
    expect(existing).toEqual([]);
    const logFile = vol.readFileSync(`${logPath}/${fileName}`, 'utf8');
    expect(logFile).not.toContain(ORG_NAME);
  }, 10000);

  it('creating an org with the same name as an org in the Group fails', async () => {
    vol.fromJSON({
      '/fixtures/create-orgs/unique-org/1-org.json': JSON.stringify({
        orgs: [{ name: ORG_NAME, groupId: GROUP_ID }],
      }),
    });
    const importFile = '/fixtures/create-orgs/unique-org/1-org.json';
    const logPath = '/fixtures/create-orgs/unique-org/';
    process.env.SNYK_LOG_PATH = logPath;
    const noDuplicateNames = true;
    const includeExistingOrgsInOutput = false;

    const { fileName, orgs, failed, totalOrgs, existing } = await createOrgs(
      importFile,
    );
    expect(failed).toHaveLength(0);
    expect(orgs).toHaveLength(1);
    expect(totalOrgs).toEqual(1);
    expect(existing.length).toBeGreaterThanOrEqual(0);
    expect(existing[0]).toHaveProperty('name', ORG_NAME);

    await expect(
      createOrgs(importFile, { noDuplicateNames, includeExistingOrgsInOutput }),
    ).rejects.toThrow(
      'All requested organizations failed to be created. Review the errors in',
    );
  }, 10000);
  it('creating an org with the same name as an org in the Group does not fail with --includeExistingOrgsInOutput', async () => {
    vol.fromJSON({
      '/fixtures/create-orgs/unique-org/1-org.json': JSON.stringify({
        orgs: [{ name: ORG_NAME, groupId: GROUP_ID }],
      }),
    });
    const importFile = '/fixtures/create-orgs/unique-org/1-org.json';
    const logPath = '/fixtures/create-orgs/unique-org/';
    process.env.SNYK_LOG_PATH = logPath;
    const noDuplicateNames = true;
    const includeExistingOrgsInOutput = true;

    const { fileName, orgs, failed, totalOrgs, existing } = await createOrgs(
      importFile,
      {
        noDuplicateNames,
        includeExistingOrgsInOutput,
      },
    );
    expect(failed).toHaveLength(1);
    expect(orgs).toHaveLength(0);
    expect(totalOrgs).toBeGreaterThanOrEqual(1);
    expect(existing.length).toBeGreaterThanOrEqual(0);
    expect(existing[0]).toHaveProperty('name', ORG_NAME);
    const logFile = vol.readFileSync(`${logPath}/${fileName}`, 'utf8');
    expect(logFile).toContain(ORG_NAME);
  }, 10000);

  it.todo('creating multiple orgs');
  it('creating an org fails', async () => {
    const noDuplicateNames = true;
    const includeExistingOrgsInOutput = false;
    vol.fromJSON({
      '/fixtures/create-orgs/fails-to-create/1-org.json': JSON.stringify({
        orgs: [{ name: ORG_NAME, groupId: GROUP_ID }],
      }),
    });
    const importFile = '/fixtures/create-orgs/fails-to-create/1-org.json';
    const logPath = '/fixtures/create-orgs/fails-to-create/';
    process.env.SNYK_LOG_PATH = logPath;
    process.env.SNYK_TOKEN = 'bad-token';

    await expect(
      createOrgs(importFile, { noDuplicateNames, includeExistingOrgsInOutput }),
    ).rejects.toThrow('fails-to-create/<groupId>.failed-to-create-orgs.log');
  }, 10000);
});
