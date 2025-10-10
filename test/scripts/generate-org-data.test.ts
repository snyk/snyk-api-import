// Mock source handlers to avoid real network calls
jest.mock('../../src/lib/source-handlers/github', () => ({
  githubOrganizations: async () => [{ name: 'org1' }, { name: 'org2' }],
  githubEnterpriseOrganizations: async (url?: string) => {
    if (!url) {
      throw new Error('Bad credentials');
    }
    return [
      { name: 'empty-org', url: url || 'https://ghe.example', id: 1 },
      { name: 'org2', url: url || 'https://ghe.example', id: 2 },
    ];
  },
  githubOrganizationIsEmpty: async (name: string) => name === 'empty-org',
}));

jest.mock('../../src/lib/source-handlers/github-cloud-app', () => ({
  listGitHubCloudAppOrgs: async () => [{ name: 'app-org' }],
  githubCloudAppOrganizationIsEmpty: async () => false,
}));

jest.mock('../../src/lib/source-handlers/gitlab', () => ({
  listGitlabGroups: async (url?: string) => {
    const token = process.env.GITLAB_TOKEN;
    if (!token || token === 'invalid-token') {
      const err: any = new Error('401 (Unauthorized)');
      err.statusCode = 401;
      throw err;
    }
    return [
      { name: 'empty-group', id: 1 },
      { name: 'group2', id: 2 },
    ];
  },
  gitlabGroupIsEmpty: async (name: string) => name === 'empty-group',
}));

jest.mock('../../src/lib/source-handlers/bitbucket-cloud', () => ({
  listBitbucketCloudWorkspaces: async () => {
    const user = process.env.BITBUCKET_CLOUD_USERNAME;
    const pass = process.env.BITBUCKET_CLOUD_PASSWORD;
    if (!user || !pass || pass === 'wrong_password') {
      const err: any = new Error('Bad credentials');
      err.statusCode = 401;
      throw err;
    }
    return [{ name: 'bb-workspace' }];
  },
  bitbucketCloudWorkspaceIsEmpty: async () => false,
}));

jest.mock('../../src/lib/source-handlers/bitbucket-cloud-app', () => ({
  listBitbucketCloudAppWorkspaces: async () => [{ name: 'bb-app-workspace' }],
  bitbucketCloudAppWorkspaceIsEmpty: async () => false,
}));

jest.mock('../../src/lib/source-handlers/bitbucket-server', () => ({
  listBitbucketServerProjects: async () => [{ name: 'proj1' }],
  bitbucketServerProjectIsEmpty: async () => false,
}));

import { SupportedIntegrationTypesImportOrgData } from '../../src/lib/types';
import { generateOrgData as generateOrgImportDataFile } from '../../src/scripts/generate-org-data';
import { deleteFiles } from '../delete-files';

// Provide default test environment variables so tests that expect
// successful mocked network calls don't fail when TEST_* vars are not set
process.env.TEST_GHE_URL = process.env.TEST_GHE_URL || 'https://ghe.example';
process.env.TEST_GHE_TOKEN = process.env.TEST_GHE_TOKEN || 'test-ghe-token';
process.env.TEST_GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN || 'test-gitlab-token';
process.env.TEST_GITLAB_BASE_URL =
  process.env.TEST_GITLAB_BASE_URL || 'https://gitlab.example';
process.env.BBC_USERNAME = process.env.BBC_USERNAME || 'bb-user';
process.env.BBC_PASSWORD = process.env.BBC_PASSWORD || 'bb-pass';

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

  it('throws an error when Gitlab Orgs requested without valid token', async () => {
    process.env.GITLAB_TOKEN = 'invalid-token';
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
