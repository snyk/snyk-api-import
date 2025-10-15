import { listGitlabGroups } from '../../../../src/lib/source-handlers/gitlab/list-groups';

jest.mock('../../../../src/lib/source-handlers/gitlab');
import * as gitlab from '../../../../src/lib/source-handlers/gitlab';

describe('listGitlabGroups', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });
  it('list repos (Gitlab Custom URL) (mocked)', async () => {
    (gitlab.listGitlabGroups as jest.Mock).mockResolvedValueOnce([
      { name: 'custom-url-group', id: 789, url: 'https://custom.gitlab/groups/custom-url-group' },
    ]);
    const groups = await gitlab.listGitlabGroups('https://custom.gitlab');
    expect(groups[0]).toEqual({
      name: 'custom-url-group',
      id: 789,
      url: 'https://custom.gitlab/groups/custom-url-group',
    });
  });
  it('lists groups', async () => {
    (gitlab.listGitlabGroups as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-group', id: 123, url: 'https://gitlab.com/groups/mock-group' },
    ]);
    const groups = await gitlab.listGitlabGroups();
    expect(groups[0]).toEqual({
      name: 'mock-group',
      id: 123,
      url: 'https://gitlab.com/groups/mock-group',
    });
  });
  it('lists groups for self-hosted', async () => {
    (gitlab.listGitlabGroups as jest.Mock).mockResolvedValueOnce([
      { name: 'mock-selfhosted-group', id: 456, url: 'https://gitlab.example.com/groups/mock-selfhosted-group' },
    ]);
    const groups = await gitlab.listGitlabGroups('https://gitlab.example.com');
    expect(groups[0]).toEqual({
      name: 'mock-selfhosted-group',
      id: 456,
      url: 'https://gitlab.example.com/groups/mock-selfhosted-group',
    });
  });
});
