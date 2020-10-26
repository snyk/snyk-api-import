import * as path from 'path';
import { requestsManager } from 'snyk-request-manager';
import { CREATED_ORG_LOG_NAME } from '../../src/common';
import { deleteOrg } from '../../src/lib/org';
import { createOrgs } from '../../src/scripts/create-orgs';
import { deleteFiles } from '../delete-files';

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
  });
  afterAll(async () => {
    for (const orgId of createdOrgs) {
      await deleteOrg(requestManager, orgId);
    };
  })
  it('create 1 org', async () => {
    const importFile = path.resolve(__dirname + '/fixtures/create-orgs/1-org/1-org.json');
    const logPath = path.resolve(__dirname + '/fixtures/create-orgs/1-org/');
    process.env.SNYK_LOG_PATH = logPath;
    filesToDelete.push(path.resolve(logPath + `/abc.${CREATED_ORG_LOG_NAME}`));

    const {fileName, orgs} = await createOrgs(importFile);
    expect(orgs).not.toBeNull();
    expect(orgs[0]).toEqual( {
      created: expect.any(String),
      groupId: 'abc',
      id: expect.any(String),
      integrations: expect.any(Object),
      name: "snyk-api-import-test-org",
      orgId: expect.any(String),
      origName: "snyk-api-import-test-org",
      sourceOrgId: undefined,
    });
    createdOrgs.push(orgs[0].orgId);
    filesToDelete.push(path.resolve(logPath, fileName));
  });
  it.todo('creating multiple orgs');
  it('creating an org fails', async () => {
    const importFile = path.resolve(__dirname + '/fixtures/create-orgs/fails-to-create/1-org.json');
    const logPath = path.resolve(__dirname + '/fixtures/create-orgs/fails-to-create/');
    process.env.SNYK_LOG_PATH = logPath;
    process.env.SNYK_TOKEN = 'bad-token';

    expect(createOrgs(importFile)).rejects.toThrow("All requested orgs failed to be created. Review the errors in /Users/lili/www/tech-services/snyk-api-import/test/scripts/fixtures/create-orgs/fails-to-create/<groupId>.failed-to-create-orgs.log");
  }, 1000);
});
