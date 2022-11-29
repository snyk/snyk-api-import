import * as fs from 'fs';
import { gitClone } from '../../src/lib';
import { SupportedIntegrationTypesUpdateProject } from '../../src/lib/types';

describe('gitClone', () => {
  const OLD_ENV = process.env;
  const removeFolders: string[] = [];
  afterAll(() => {
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
  describe('Github', () => {
    it('successfully clones a repo', async () => {
      process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
      process.env.SNYK_LOG_PATH = __dirname;

      const res = await gitClone(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        {
          branch: 'master',
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
      process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
      process.env.SNYK_LOG_PATH = __dirname;

      const res = await gitClone(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        {
          branch: 'non-existent',
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
      removeFolders.push(res.repoPath!);
    }, 70000);
  });
});
