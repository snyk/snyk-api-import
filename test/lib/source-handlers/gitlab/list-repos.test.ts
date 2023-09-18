import { listGitlabRepos } from '../../../../src/lib/source-handlers/gitlab/list-repos';

describe('listGitlabRepos', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list repos (Gitlab Custom URL)', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    const GITLAB_ORG_NAME = process.env.TEST_GITLAB_ORG_NAME;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;

    const repos = await listGitlabRepos(
      GITLAB_ORG_NAME as string,
      GITLAB_BASE_URL,
    );
    expect(repos.length >= 1).toBeTruthy();
    expect(repos[0]).toEqual({
      name: expect.any(String),
      id: expect.any(Number),
      branch: expect.any(String),
      fork: expect.any(Boolean),
    });
    expect(
      repos.filter((r) => r.name === `${GITLAB_ORG_NAME}/shared-with-group`),
    ).toHaveLength(1);
  }, 10000);
  it('list repos (Gitlab Custom URL) excludes a shared project', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    const GITLAB_ORG_NAME = process.env.TEST_GITLAB_ORG_NAME;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;
    // shared-with-group project is shared with group snyk-test
    const gitlabGroupName = 'another-group-for-contract-tests';
    const repos = await listGitlabRepos(gitlabGroupName, GITLAB_BASE_URL);
    expect(
      repos.filter((r) => r.name === `${GITLAB_ORG_NAME}/shared-with-group`),
    ).toEqual([]);
    expect(repos.length > 0).toBeTruthy();
  }, 10000);

  it('list repos for a sub-group', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;
    const gitlabGroupName = 'snyk-api-import-contract-tests/example-sub-group';
    const repos = await listGitlabRepos(gitlabGroupName, GITLAB_BASE_URL);
    expect(repos.length > 0).toBeTruthy();
  }, 10000);
});
