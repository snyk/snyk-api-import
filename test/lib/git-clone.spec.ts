import * as fs from 'fs';
import { gitClone } from '../../src/lib';
import { SupportedIntegrationTypesUpdateProject } from '../../src/lib/types';

describe('gitClone', () => {
  describe('Github', () => {
    const OLD_ENV = process.env;
    const removeFolders: string[] = [];
    afterEach(() => {
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      for (const f of removeFolders) {
        try {
          fs.rmdirSync(f, { recursive: true });
        } catch (e) {
          console.log('Failed to clean up test', e);
        }
      }
    });
    it('successfully clones a repo', async () => {
      process.env.SNYK_LOG_PATH = __dirname;

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

    it('fails to clone a repo for non-existent branch', async () => {
      process.env.SNYK_LOG_PATH = __dirname;

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
  });
  describe('Github Enterprise', () => {
    const OLD_ENV = process.env;
    const removeFolders: string[] = [];
    const GHE_URL = new URL(process.env.TEST_GHE_URL!);

    afterAll(() => {
      process.env = { ...OLD_ENV };
    });
    beforeEach(() => {
      process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    });

    afterEach(() => {
      for (const f of removeFolders) {
        try {
          fs.rmdirSync(f, { recursive: true });
        } catch (e) {
          console.log('Failed to clean up test', e);
        }
      }
    });

    it('successfully clones a repo', async () => {
      process.env.SNYK_LOG_PATH = __dirname;
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

    it('fails to clone a repo for non-existent branch', async () => {
      process.env.SNYK_LOG_PATH = __dirname;

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

    it('fails to clone a repo with invalid token', async () => {
      process.env.SNYK_LOG_PATH = __dirname;
      process.env.GITHUB_TOKEN = 'bad-token';

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
