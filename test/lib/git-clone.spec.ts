import { mockClone } from '../simple-git.mock';
import * as fs from 'fs';
import { gitClone } from '../../src/lib';
import { SupportedIntegrationTypesUpdateProject } from '../../src/lib/types';

describe('gitClone (mocked simple-git)', () => {
  const OLD_ENV = process.env;
  const removeFolders: string[] = [];

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    mockClone.mockClear();
  });

  afterEach(() => {
    for (const f of removeFolders) {
      try {
        fs.rmSync(f, { recursive: true, force: true, maxRetries: 3 });
      } catch (e) {
        console.log('Failed to clean up test', e);
      }
    }
  });

  afterAll(() => {
    process.env = { ...OLD_ENV };
  });

  it('successfully clones a repo (github)', async () => {
    process.env.SNYK_LOG_PATH = __dirname;
  (mockClone as any).mockResolvedValue('');

    const res = await gitClone(
      SupportedIntegrationTypesUpdateProject.GITHUB,
      {
        branch: 'master',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      },
    );

    expect(res).toEqual({
      gitResponse: '',
      repoPath: expect.any(String),
      success: true,
    });
    removeFolders.push(res.repoPath!);
  }, 70000);

  it('fails to clone a repo for non-existent branch (github)', async () => {
    process.env.SNYK_LOG_PATH = __dirname;
  (mockClone as any).mockRejectedValue(new Error('Remote branch non-existent not found in upstream origin'));

    const res = await gitClone(
      SupportedIntegrationTypesUpdateProject.GITHUB,
      {
        branch: 'non-existent',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      },
    );

    expect(res).toEqual({
      gitResponse: expect.stringContaining(
        'Remote branch non-existent not found in upstream origin',
      ),
      success: false,
    });
  }, 70000);

  // GitHub Enterprise tests (mocked) - use dummy host values
  describe('Github Enterprise (mocked)', () => {
    const GHE_URL = new URL('https://ghe.example.com');

    beforeEach(() => {
      process.env.GITHUB_TOKEN = 'fake-token';
    });

    it('successfully clones a repo (GHE)', async () => {
      process.env.SNYK_LOG_PATH = __dirname;
  (mockClone as any).mockResolvedValue('');

      const res = await gitClone(SupportedIntegrationTypesUpdateProject.GHE, {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
      });

      expect(res).toEqual({
        gitResponse: '',
        repoPath: expect.any(String),
        success: true,
      });
      removeFolders.push(res.repoPath!);
    }, 70000);

    it('fails to clone a repo for non-existent branch (GHE)', async () => {
      process.env.SNYK_LOG_PATH = __dirname;
  (mockClone as any).mockRejectedValue(new Error('Remote branch non-existent not found in upstream origin'));

      const res = await gitClone(SupportedIntegrationTypesUpdateProject.GHE, {
        branch: 'non-existent',
        archived: false,
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
      });

      expect(res).toEqual({
        gitResponse: expect.stringContaining(
          'Remote branch non-existent not found in upstream origin',
        ),
        success: false,
      });
    }, 70000);

    it('fails to clone a repo with invalid token (GHE)', async () => {
      process.env.SNYK_LOG_PATH = __dirname;
      process.env.GITHUB_TOKEN = 'bad-token';
  (mockClone as any).mockRejectedValue(new Error('Authentication failed'));

      const res = await gitClone(SupportedIntegrationTypesUpdateProject.GHE, {
        branch: 'non-existent',
        archived: false,
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
      });

      expect(res).toEqual({
        gitResponse: expect.stringContaining('Authentication failed'),
        success: false,
      });
    }, 70000);
  });
});
