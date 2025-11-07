import { chooseCloneUrl } from '../../src/lib/git-clone';

describe('chooseCloneUrl', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns sshUrl when BITBUCKET_USE_SSH=true and sshUrl present', () => {
    process.env.BITBUCKET_USE_SSH = 'true';
    const meta: any = {
      cloneUrl: 'https://bitbucket.org/workspace/repo.git',
      sshUrl: 'git@bitbucket.org:workspace/repo.git',
    };
    expect(chooseCloneUrl(meta)).toBe(meta.sshUrl);
  });

  it('returns sshUrl when SSH_AUTH_SOCK set and sshUrl present', () => {
    delete process.env.BITBUCKET_USE_SSH;
    process.env.SSH_AUTH_SOCK = '/tmp/ssh-XXXX/agent.1234';
    const meta: any = {
      cloneUrl: 'https://bitbucket.org/workspace/repo.git',
      sshUrl: 'git@bitbucket.org:workspace/repo.git',
    };
    expect(chooseCloneUrl(meta)).toBe(meta.sshUrl);
  });

  it('returns https cloneUrl when ssh not preferred', () => {
    delete process.env.BITBUCKET_USE_SSH;
    delete process.env.SSH_AUTH_SOCK;
    const meta: any = {
      cloneUrl: 'https://bitbucket.org/workspace/repo.git',
      sshUrl: 'git@bitbucket.org:workspace/repo.git',
    };
    expect(chooseCloneUrl(meta)).toBe(meta.cloneUrl);
  });

  it('falls back to cloneUrl when SSH preferred but sshUrl missing', () => {
    process.env.BITBUCKET_USE_SSH = '1';
    const meta: any = {
      cloneUrl: 'https://bitbucket.org/workspace/repo.git',
      sshUrl: undefined,
    };
    expect(chooseCloneUrl(meta)).toBe(meta.cloneUrl);
  });
});
