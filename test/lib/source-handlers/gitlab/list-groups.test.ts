import { listGitlabGroups } from '../../../../src/lib/source-handlers/gitlab/list-groups';

describe('listGitlabGroups', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list repos (Gitlab Custom URL)', async () => {
    const GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL;
    process.env.GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN;

    const groups = await listGitlabGroups(GITLAB_BASE_URL);
    expect(groups.length >= 1).toBeTruthy();
    expect(groups[0]).toEqual({
      name: expect.any(String),
      id: expect.any(Number),
      url: expect.any(String),
    });
  }, 10000);
});
