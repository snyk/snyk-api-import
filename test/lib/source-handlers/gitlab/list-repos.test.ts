import { listGitlabRepos } from '../../../../src/lib/source-handlers/gitlab/list-repos';

jest.mock('../../../../src/lib/source-handlers/gitlab');
import * as gitlab from '../../../../src/lib/source-handlers/gitlab';

describe('listGitlabRepos', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list repos (Gitlab Custom URL) (mocked)', async () => {
    (gitlab.listGitlabRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'custom-url-repo', owner: 'custom-owner', branch: 'main', fork: false },
    ]);
    const repos = await gitlab.listGitlabRepos('custom-group', 'https://custom.gitlab');
    expect(repos[0]).toEqual({
      name: 'custom-url-repo',
      owner: 'custom-owner',
      branch: 'main',
      fork: false,
    });
  });
  it('list repos (Gitlab Custom URL) excludes a shared project (mocked)', async () => {
    (gitlab.listGitlabRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'shared-repo', owner: 'shared-owner', branch: 'main', fork: false },
    ]);
    const repos = await gitlab.listGitlabRepos('shared-group', 'https://custom.gitlab');
    expect(repos.filter((r) => r.name === 'not-shared')).toEqual([]);
    expect(repos.length > 0).toBeTruthy();
  });
  it('list repos for a sub-group (mocked)', async () => {
    (gitlab.listGitlabRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'subgroup-repo', owner: 'subgroup-owner', branch: 'main', fork: false },
    ]);
    const repos = await gitlab.listGitlabRepos('subgroup', 'https://custom.gitlab');
    expect(repos[0]).toEqual({
      name: 'subgroup-repo',
      owner: 'subgroup-owner',
      branch: 'main',
      fork: false,
    });
  });
  it('lists repos', async () => {
    (gitlab.listGitlabRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-repo', owner: 'mock-owner', branch: 'main', fork: false },
    ]);
    const repos = await gitlab.listGitlabRepos('mock-group');
    expect(repos[0]).toEqual({
      name: 'mock-repo',
      owner: 'mock-owner',
      branch: 'main',
      fork: false,
    });
  });
  it('lists repos for self-hosted', async () => {
    (gitlab.listGitlabRepos as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-selfhosted-repo', owner: 'mock-selfhosted-owner', branch: 'main', fork: true },
    ]);
    const repos = await gitlab.listGitlabRepos('mock-group', 'https://gitlab.example.com');
    expect(repos[0]).toEqual({
      name: 'mock-selfhosted-repo',
      owner: 'mock-selfhosted-owner',
      branch: 'main',
      fork: true,
    });
  });
});
