jest.mock('../../../../src/lib/source-handlers/github');
import * as github from '../../../../src/lib/source-handlers/github';

describe('listGithubOrgs script', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list orgs', async () => {
    (github.listGithubOrgs as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-org', id: 123, url: 'https://mock-github/orgs/mock-org' },
    ]);
    const orgs = await github.listGithubOrgs();
    expect(orgs[0]).toEqual({
      name: 'mock-org',
      id: 123,
      url: 'https://mock-github/orgs/mock-org',
    });
  });
  it('list orgs GHE (mocked)', async () => {
    (github.listGithubOrgs as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-ghe-org', id: 456, url: 'https://ghe.example.com/orgs/mock-ghe-org' },
    ]);
    const orgs = await github.listGithubOrgs('https://ghe.example.com');
    expect(orgs[0]).toEqual({
      name: 'mock-ghe-org',
      id: 456,
      url: 'https://ghe.example.com/orgs/mock-ghe-org',
    });
  });
});

describe('listGithubRepos script', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list repos', async () => {
    (github.listGithubRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-repo', owner: 'mock-owner', branch: 'main', fork: false },
    ]);
    const orgs = await github.listGithubRepos('mock-org');
    expect(orgs[0]).toEqual({
      name: 'mock-repo',
      owner: 'mock-owner',
      branch: 'main',
      fork: false,
    });
  });
  it('list GHE repos (mocked)', async () => {
    (github.listGithubRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-ghe-repo', owner: 'mock-ghe-owner', branch: 'main', fork: true },
    ]);
    const orgs = await github.listGithubRepos('mock-ghe-org', 'https://ghe.example.com');
    expect(orgs[0]).toEqual({
      name: 'mock-ghe-repo',
      owner: 'mock-ghe-owner',
      branch: 'main',
      fork: true,
    });
  });
});

describe('isGithubConfigured', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('correctly configured', async () => {
    (github.isGithubConfigured as jest.Mock).mockImplementation(() => true);
    const configured = github.isGithubConfigured();
    expect(configured).toBeTruthy();
  });
  it('not configured should throw', async () => {
    (github.isGithubConfigured as jest.Mock).mockImplementation(() => { throw new Error('Not configured'); });
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
    (github.buildGitCloneUrl as jest.Mock).mockImplementation((repo) => {
      return `https://secret_token:x-oauth-basic@github.com/snyk/snyk-api-import.git`;
    });
    const url = github.buildGitCloneUrl({
      branch: 'main',
      archived: false,
      sshUrl: 'https://git@github.com:snyk/snyk-api-import.git',
      cloneUrl: 'https://github.com/snyk/snyk-api-import.git',
    });
    expect(url).toEqual(
      `https://secret_token:x-oauth-basic@github.com/snyk/snyk-api-import.git`,
    );
  });
});
