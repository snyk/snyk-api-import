import * as path from 'path';
import * as fs from 'fs';

import { requestsManager } from 'snyk-request-manager';
import { CREATED_ORG_LOG_NAME } from '../../src/common';
import { deleteOrg } from '../../src/lib';
import { createOrgs } from '../../src/scripts/create-orgs';
import { deleteFiles } from '../delete-files';

const ORG_NAME = process.env.TEST_ORG_NAME as string;
const GROUP_ID = process.env.TEST_GROUP_ID as string;

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('createOrgs script', () => {
  const OLD_ENV = process.env;
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  const SNYK_API_TEST = process.env.SNYK_API_TEST as string;
  process.env.SNYK_API = SNYK_API_TEST;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;

  const filesToDelete: string[] = [];
  const createdOrgs: string[] = [];
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterEach(async () => {
    process.env = { ...OLD_ENV };
    await deleteFiles(filesToDelete);
  }, 10000);

  afterAll(async () => {
    process.env = { ...OLD_ENV };
    for (const orgId of createdOrgs) {
      await deleteOrg(requestManager, orgId);
    }
  });

  // too flaky to run every time
  it('create 1 org', async () => {
    const importFile = path.resolve(
      __dirname + '/fixtures/create-orgs/1-org/1-org.json',
    );
    const logPath = path.resolve(__dirname + '/fixtures/create-orgs/1-org/');
    process.env.SNYK_LOG_PATH = logPath;
    filesToDelete.push(path.resolve(logPath + `/abc.${CREATED_ORG_LOG_NAME}`));

    const { fileName, orgs, existing } = await createOrgs(importFile);
    createdOrgs.push(...orgs.map((o) => o.orgId));
    const log = path.resolve(logPath, fileName);

    filesToDelete.push(log);
    expect(orgs).not.toBeNull();
    expect(orgs[0]).toMatchObject({
      created: expect.any(String),
      groupId: GROUP_ID,
      id: expect.any(String),
      integrations: expect.any(Object),
      name: 'snyk-api-import-hello',
      orgId: expect.any(String),
      origName: 'snyk-api-import-hello',
      sourceOrgId: undefined,
      slug: expect.any(String),
      url: expect.any(String),
      group: expect.any(Object),
    });
    expect(existing).not.toBeNull();
    expect(existing.length >= 1).toBeTruthy();
    expect(existing.filter((o) => o.name === ORG_NAME)[0]).toMatchObject({
      // created: expect.any(String), not always there?  flaky
      groupId: GROUP_ID,
      id: expect.any(String),
      integrations: expect.any(Object),
      name: ORG_NAME,
      orgId: expect.any(String),
      origName: ORG_NAME,
      slug: expect.any(String),
      url: expect.any(String),
      group: expect.any(Object),
    });
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 1000));
    const logFile = fs.readFileSync(log, 'utf8');
    expect(logFile).toMatch(ORG_NAME);
  }, 50000);
  it('create 1 org and do not list existing', async () => {
    const importFile = path.resolve(
      __dirname + '/fixtures/create-orgs/1-org/1-org.json',
    );
    const logPath = path.resolve(__dirname + '/fixtures/create-orgs/1-org/');
    process.env.SNYK_LOG_PATH = logPath;
    filesToDelete.push(path.resolve(logPath + `/abc.${CREATED_ORG_LOG_NAME}`));

    const { fileName, orgs, existing } = await createOrgs(importFile, {
      includeExistingOrgsInOutput: false,
    });
    const log = path.resolve(logPath, fileName);
    createdOrgs.push(...orgs.map((o) => o.orgId));
    filesToDelete.push(log);
    expect(orgs).not.toBeNull();
    expect(orgs[0]).toMatchObject({
      created: expect.any(String),
      groupId: GROUP_ID,
      id: expect.any(String),
      integrations: expect.any(Object),
      name: 'snyk-api-import-hello',
      orgId: expect.any(String),
      origName: 'snyk-api-import-hello',
      sourceOrgId: undefined,
      slug: expect.any(String),
      url: expect.any(String),
      group: expect.any(Object),
    });
    expect(existing).toEqual([]);
    // give file a little time to be finished to be written
    await new Promise((r) => setTimeout(r, 1000));
    const logFile = fs.readFileSync(log, 'utf8');
    expect(logFile).not.toMatch(ORG_NAME);
  }, 50000);

  it('creating an org with the same name as an org in the Group fails', async () => {
    const importFile = path.resolve(
      __dirname + '/fixtures/create-orgs/unique-org/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/unique-org/',
    );
    process.env.SNYK_LOG_PATH = logPath;
    const noDuplicateNames = true;
    const includeExistingOrgsInOutput = true;

    // first create the org
    const { fileName, orgs, failed, totalOrgs, existing } = await createOrgs(
      importFile,
    );
    // cleanup
    createdOrgs.push(orgs[0].orgId);
    filesToDelete.push(path.resolve(logPath, fileName));
    filesToDelete.push(path.resolve(logPath + `/abc.${CREATED_ORG_LOG_NAME}`));

    expect(failed).toHaveLength(0);
    expect(orgs).toHaveLength(1);
    expect(totalOrgs).toEqual(1);

    expect(existing).not.toBeNull();
    expect(existing.length >= 1).toBeTruthy();
    expect(existing.filter((o) => o.name === ORG_NAME)[0]).toMatchObject({
      // created: expect.any(String), not always there?  flaky
      groupId: GROUP_ID,
      id: expect.any(String),
      integrations: expect.any(Object),
      name: ORG_NAME,
      orgId: expect.any(String),
      origName: ORG_NAME,
      slug: expect.any(String),
      url: expect.any(String),
      group: expect.any(Object),
    });

    // try again but in stricter name check mode and expect a it to fail
    expect(
      createOrgs(importFile, { noDuplicateNames, includeExistingOrgsInOutput }),
    ).rejects.toThrow(
      'All requested organizations failed to be created. Review the errors in',
    );
  }, 70000);

  it.todo('creating multiple orgs');
  it('creating an org fails', async () => {
    const importFile = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/1-org.json',
    );
    const logPath = path.resolve(
      __dirname + '/fixtures/create-orgs/fails-to-create/',
    );
    process.env.SNYK_LOG_PATH = logPath;
    process.env.SNYK_TOKEN = 'bad-token';

    expect(createOrgs(importFile)).rejects.toThrow(
      'fails-to-create/<groupId>.failed-to-create-orgs.log',
    );
  }, 70000);
});
