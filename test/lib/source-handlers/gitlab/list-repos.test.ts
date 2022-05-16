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
    for (let i = 0; i < repos.length; i ++){
      expect(repos[i].name).not.toContain("shared-with-group");
    }
  });
});
