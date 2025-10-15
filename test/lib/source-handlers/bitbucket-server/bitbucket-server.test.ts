
jest.mock('../../../../src/lib/source-handlers/bitbucket-server');
import * as bitbucketServer from '../../../../src/lib/source-handlers/bitbucket-server';

jest.setTimeout(60000);

describe('listBitbucketServerProjects script', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('listBitbucketServerProjects script (mocked)', async () => {
    (bitbucketServer.listBitbucketServerProjects as jest.Mock).mockResolvedValueOnce([
      { key: 'MOCK', id: 1, name: 'Mock Project' },
      { key: 'MOCK2', id: 2, name: 'Mock Project 2' },
    ]);
    const projects = await bitbucketServer.listBitbucketServerProjects('https://mock-bitbucket-server');
    expect(projects).toBeTruthy();
    expect(projects[0]).toHaveProperty('key', 'MOCK');
    expect(projects[0]).toHaveProperty('id', 1);
    expect(projects[0]).toHaveProperty('name', 'Mock Project');
  });
  it('listBitbucketServerRepos script (mocked)', async () => {
    (bitbucketServer.listBitbucketServerRepos as jest.Mock).mockResolvedValueOnce([
      { projectKey: 'MOCK', repoSlug: 'mock-repo' },
      { projectKey: 'MOCK', repoSlug: 'mock-repo-2' },
    ]);
    const repos = await bitbucketServer.listBitbucketServerRepos('MOCK', 'https://mock-bitbucket-server');
    expect(repos).toBeTruthy();
    expect(repos[0]).toEqual({
      projectKey: 'MOCK',
      repoSlug: 'mock-repo',
    });
  });
  it('listBitbucketServerRepos script to throw (mocked)', async () => {
    (bitbucketServer.listBitbucketServerRepos as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
    await expect(bitbucketServer.listBitbucketServerRepos('non-existing-project', 'https://non-existing-url')).rejects.toThrow('Not found');
  });
});
