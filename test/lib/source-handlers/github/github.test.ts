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
  });
  it('list orgs GHE', async () => {
    process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    const GHE_URL = process.env.TEST_GHE_URL;
    const orgs = await github.listGithubOrgs(GHE_URL);
    expect(orgs[0]).toEqual({
      name: expect.any(String),
      id: expect.any(Number),
      url: expect.any(String),
    });
  });
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
  });
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
  });
});
