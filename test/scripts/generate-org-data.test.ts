import { SupportedIntegrationTypesToGenerateImportData } from '../../src/lib/types';
import { generateOrgImportDataFile } from '../../src/scripts/generate-org-data';
import { deleteFiles } from '../delete-files';

describe('generateOrgImportDataFile Github script', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToCleanup: string[] = [
    __dirname + '/group-groupIdExample-github-com-orgs.json',
    __dirname + '/group-groupIdExample-github-enterprise-orgs.json',
  ];
  afterAll(async () => {
    process.env = { ...OLD_ENV };
  });

  afterEach(async () => {
    await deleteFiles(filesToCleanup);
  });
  it('generate Github Orgs data', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    const groupId = 'groupIdExample';
    const sourceOrgId = 'sourceOrgIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesToGenerateImportData.GITHUB,
      groupId,
      sourceOrgId,
      undefined,
    );
    expect(res.fileName).toEqual('group-groupIdExample-github-com-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
      sourceOrgId,
    });
  });

  it('generate Github Orgs data and skips empty orgs', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    const groupId = 'groupIdExample';
    const sourceOrgId = 'sourceOrgIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesToGenerateImportData.GITHUB,
      groupId,
      sourceOrgId,
      undefined,
      true,
    );
    expect(res.fileName).toEqual('group-groupIdExample-github-com-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs.length).toBeGreaterThanOrEqual(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
      sourceOrgId,
    });
  });
  it('generate Github Orgs data without sourceOrgId', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    const groupId = 'groupIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesToGenerateImportData.GITHUB,
      groupId,
    );
    expect(res.fileName).toEqual('group-groupIdExample-github-com-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  });

  it('throws an error when Github Enterprise Orgs requested without sourceUrl', async () => {
    process.env.GITHUB_TOKEN = process.env.GHE_TOKEN;
    const groupId = 'groupIdExample';

    expect(
      generateOrgImportDataFile(
        SupportedIntegrationTypesToGenerateImportData.GHE,
        groupId,
      ),
    ).rejects.toThrow(
      'Please provide required `sourceUrl` for Github Enterprise source',
    );
  });
  it('generate Github Enterprise Orgs data', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;

    const groupId = 'groupIdExample';
    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesToGenerateImportData.GHE,
      groupId,
      undefined,
      GHE_URL,
    );
    expect(res.fileName).toEqual(
      'group-groupIdExample-github-enterprise-orgs.json',
    );
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  }, 50000);
  it('generate Github Enterprise Orgs data & skips empty Orgs', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;

    const groupId = 'groupIdExample';
    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesToGenerateImportData.GHE,
      groupId,
      undefined,
      GHE_URL,
      true,
    );
    expect(res.fileName).toEqual(
      'group-groupIdExample-github-enterprise-orgs.json',
    );
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs[0]).toEqual({
      name: expect.any(String),
      url: expect.any(String),
      id: expect.any(Number),
    });
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  }, 50000);
});
