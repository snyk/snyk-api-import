const mockClone = jest.fn().mockResolvedValue('');

jest.mock('simple-git', () => ({
  simpleGit: () => ({
    clone: mockClone,
  }),
}));

import { gitClone } from '../../src/lib';
import { SupportedIntegrationTypesUpdateProject } from '../../src/lib/types';

describe('gitClone uses chosen clone URL', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    mockClone.mockClear();
  });

  afterAll(() => {
    process.env = { ...OLD_ENV };
  });

  it('uses sshUrl when BITBUCKET_USE_SSH=true', async () => {
    process.env.BITBUCKET_USE_SSH = 'true';

    const meta = {
      branch: 'master',
      archived: false,
      cloneUrl: 'https://bitbucket.org/workspace/repo.git',
      sshUrl: 'git@bitbucket.org:workspace/repo.git',
    } as any;

    const res = await gitClone(
      SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD_APP,
      meta,
    );

    expect(mockClone).toHaveBeenCalledTimes(1);
    // clone(url, repoClonePath, cloneArgs)
    expect(mockClone.mock.calls[0][0]).toBe(meta.sshUrl);
    expect(mockClone.mock.calls[0][2]).toMatchObject({ '--depth': '1', '--branch': 'master' });
    expect(res.success).toBe(true);
  });

  it('uses https cloneUrl when SSH not preferred', async () => {
    delete process.env.BITBUCKET_USE_SSH;
    delete process.env.SSH_AUTH_SOCK;

    const meta = {
      branch: 'master',
      archived: false,
      cloneUrl: 'https://bitbucket.org/workspace/repo.git',
      sshUrl: 'git@bitbucket.org:workspace/repo.git',
    } as any;

    const res = await gitClone(
      SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD_APP,
      meta,
    );

    expect(mockClone).toHaveBeenCalledTimes(1);
    expect(mockClone.mock.calls[0][0]).toBe(meta.cloneUrl);
    expect(res.success).toBe(true);
  });
});
