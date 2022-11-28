import * as github from '../../../../src/lib/source-handlers/github';

describe('listGithubOrgs script', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list orgs', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    const orgs = await github.listGithubOrgs();
    expect(orgs[0]).toEqual({
      name: expect.any(String),
      id: expect.any(Number),
      url: expect.any(String),
    });
  }, 50000);
  it('list orgs GHE', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;
    const orgs = await github.listGithubOrgs(GHE_URL);
    expect(orgs[0]).toEqual({
      name: expect.any(String),
      id: expect.any(Number),
      url: expect.any(String),
    });
  }, 30000);
});

describe('listGithubRepos script', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list repos', async () => {
    const GITHUB_ORG_NAME = process.env.TEST_GH_ORG_NAME;
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;

    const orgs = await github.listGithubRepos(GITHUB_ORG_NAME as string);
    expect(orgs[0]).toEqual({
      name: expect.any(String),
      owner: expect.any(String),
      branch: expect.any(String),
      fork: expect.any(Boolean),
    });
  }, 40000);
  it('list GHE repos', async () => {
    const GITHUB_ORG_NAME = process.env.TEST_GH_ORG_NAME;
    const GHE_URL = process.env.TEST_GHE_URL;
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;

    const orgs = await github.listGithubRepos(
      GITHUB_ORG_NAME as string,
      GHE_URL,
    );
    expect(orgs[0]).toEqual({
      name: expect.any(String),
      owner: expect.any(String),
      branch: expect.any(String),
      fork: expect.any(Boolean),
    });
  }, 30000);
});

describe('isGithubConfigured', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('correctly configured', async () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;

    const configured = github.isGithubConfigured();
    expect(configured).toBeTruthy();
  });
  it('not configured should throw', async () => {
    delete process.env.GITHUB_TOKEN;
    expect(() => github.isGithubConfigured()).toThrow();
  });
});

describe('buildGitCloneUrl', () => {
  const OLD_ENV = process.env;

  beforeEach(async () => {
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('builds correct clone url for github.com / ghe (the urls come back from API already correct)', async () => {
    process.env.GITHUB_TOKEN = 'secret_token';
    const url = github.buildGitCloneUrl({
      branch: 'main',
      sshUrl: 'https://git@github.com:snyk-tech-services/snyk-api-import.git',
      cloneUrl: 'https://github.com/snyk-tech-services/snyk-api-import.git',
    });
    expect(url).toEqual(
      `https://secret_token@github.com/snyk-tech-services/snyk-api-import.git`,
    );
  });
});
