import { SupportedIntegrationTypesImportOrgData } from '../../src/lib/types';
import { generateOrgImportDataFile } from '../../src/scripts/generate-org-data';
import { deleteFiles } from '../delete-files';

describe('generateOrgImportDataFile Github script', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToCleanup: string[] = [
    __dirname + '/group-groupIdExample-github-com-orgs.json',
    __dirname + '/group-groupIdExample-github-enterprise-orgs.json',
  ];
  afterAll(() => {
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
      SupportedIntegrationTypesImportOrgData.GITHUB,
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
  }, 20000);

  it('generate Github Orgs data and skips empty orgs', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    const groupId = 'groupIdExample';
    const sourceOrgId = 'sourceOrgIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.GITHUB,
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
      SupportedIntegrationTypesImportOrgData.GITHUB,
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

  it('throws an error when Github Enterprise Server Orgs requested without sourceUrl', async () => {
    process.env.GITHUB_TOKEN = process.env.GHE_TOKEN;
    const groupId = 'groupIdExample';

    expect(
      generateOrgImportDataFile(
        SupportedIntegrationTypesImportOrgData.GHE,
        groupId,
      ),
    ).rejects.toThrow('Bad credentials');
  });
  it('generate Github Enterprise Orgs data', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;

    const groupId = 'groupIdExample';
    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.GHE,
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
  }, 160000);
  it('generate Github Enterprise Orgs data & skips empty Orgs', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;

    const groupId = 'groupIdExample';
    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.GHE,
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
  }, 160000);
});

describe('generateOrgImportDataFile Gitlab script', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToCleanup: string[] = [
    __dirname + '/group-groupIdExample-gitlab-orgs.json',
  ];
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(async () => {
    await deleteFiles(filesToCleanup);
  });

  it('generate Gitlab Orgs data', async () => {
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;
    const GITLAB_URL = process.env.TEST_GITLAB_BASE_URL;

    const groupId = 'groupIdExample';
    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.GITLAB,
      groupId,
      undefined,
      GITLAB_URL,
    );
    expect(res.fileName).toEqual('group-groupIdExample-gitlab-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  }, 160000);

  it('generate Gitlab Orgs data and skips empty orgs', async () => {
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;
    const GITLAB_URL = process.env.TEST_GITLAB_BASE_URL;

    const groupId = 'groupIdExample';
    const sourceOrgId = 'sourceOrgIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.GITLAB,
      groupId,
      sourceOrgId,
      GITLAB_URL,
      true,
    );
    expect(res.fileName).toEqual('group-groupIdExample-gitlab-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs.length).toBeGreaterThanOrEqual(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
      sourceOrgId,
    });
  }, 10000);
  it('generate Gitlab Orgs data without sourceOrgId', async () => {
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;
    const GITLAB_URL = process.env.TEST_GITLAB_BASE_URL;

    const groupId = 'groupIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.GITLAB,
      groupId,
      undefined,
      GITLAB_URL,
    );
    expect(res.fileName).toEqual('group-groupIdExample-gitlab-orgs.json');
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  });

  it('throws an error when Gitlab Orgs requested without sourceUrl', async () => {
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;
    const groupId = 'groupIdExample';

    expect(
      generateOrgImportDataFile(
        SupportedIntegrationTypesImportOrgData.GITLAB,
        groupId,
      ),
    ).rejects.toThrow('401 (Unauthorized)');
  });
});

describe('generateOrgImportDataFile Bitbucket Cloud script', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = __dirname;
  const filesToCleanup: string[] = [
    __dirname + '/group-groupIdExample-bitbucket-cloud-orgs.json',
  ];
  afterAll(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(async () => {
    await deleteFiles(filesToCleanup);
  });

  it('generate Bitbucket Cloud Orgs data', async () => {
    process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
    process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;

    const groupId = 'groupIdExample';
    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD,
      groupId,
      undefined,
    );
    expect(res.fileName).toEqual(
      'group-groupIdExample-bitbucket-cloud-orgs.json',
    );
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  }, 160000);

  it('generate Bitbucket cloud Orgs data and skips empty orgs', async () => {
    process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
    process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;

    const groupId = 'groupIdExample';
    const sourceOrgId = 'sourceOrgIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD,
      groupId,
      sourceOrgId,
      undefined,
      true,
    );
    expect(res.fileName).toEqual(
      'group-groupIdExample-bitbucket-cloud-orgs.json',
    );
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs.length).toBeGreaterThanOrEqual(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
      sourceOrgId,
    });
  }, 10000);
  it('generate Bitbucket cloud Orgs data without sourceOrgId', async () => {
    process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
    process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;

    const groupId = 'groupIdExample';

    const res = await generateOrgImportDataFile(
      SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD,
      groupId,
      undefined,
    );
    expect(res.fileName).toEqual(
      'group-groupIdExample-bitbucket-cloud-orgs.json',
    );
    expect(res.orgs.length > 0).toBeTruthy();
    expect(res.skippedEmptyOrgs).toHaveLength(0);
    expect(res.orgs[0]).toEqual({
      name: expect.any(String),
      groupId,
    });
  });

  it('Bitbucket cloud script to fail on bad credentials', async () => {
    process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
    process.env.BITBUCKET_CLOUD_PASSWORD = 'wrong_password';
    jest.useFakeTimers();
    const groupId = 'groupIdExample';

    expect(
      generateOrgImportDataFile(
        SupportedIntegrationTypesImportOrgData.BITBUCKET_CLOUD,
        groupId,
      ),
    ).rejects.toThrow();
  });
});
