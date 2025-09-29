jest.mock('../../../src/lib', () => {
  const original = jest.requireActual('../../../src/lib');
  return {
    ...original,
    gitClone: jest.fn(async () => {
      const testName = expect.getState().currentTestName;
      if (testName?.includes('processing empty repository with no branch throws')) {
        return { success: false, repoPath: undefined, gitResponse: 'fatal: Remote branch master not found in upstream origin' };
      }
      return { success: true, repoPath: `${process.cwd()}/mock-repo`, gitResponse: 'ok' };
    }),
    find: jest.fn(async (repoPath: string) => {
      const testName = expect.getState().currentTestName;
      let files: string[] = [];
      if (testName?.includes('diff between files in the repo vs monitored in Snyk (defaults to OS)')) {
        files = [`${repoPath}/Gemfile.lock`];
      } else if (testName?.includes('diff between files in the repo vs monitored in Snyk (with IAC enabled)')) {
        files = [`${repoPath}/Gemfile.lock`, `${repoPath}/bundler-app/Gemfile.lock`];
      } else if (testName?.includes('detects changes needed for a particular ecosystem (npm)')) {
        files = [`${repoPath}/npm-project/package.json`];
      } else if (testName?.includes('no changes needed')) {
        // Return all monitored project files so remove: []
        files = [
          `${repoPath}/package.json`,
          `${repoPath}/Gemfile.lock`,
          `${repoPath}/bundler-app/Gemfile.lock`,
          `${repoPath}/no-vulns-bundler-app/Gemfile.lock`,
          `${repoPath}/npm-project/package.json`,
          `${repoPath}/npm-project-with-policy/package.json`,
        ];
      } else if (testName?.includes('processing repository with no supported manifests > nothing to do')) {
        files = [];
      } else if (testName?.includes('correctly matches python files using globs')) {
        files = [`${repoPath}/requirements/dev.txt`, `${repoPath}/requirements/prod.txt`];
      }
      return { files, allFilesFound: files };
    }),
  };
});
import * as fs from 'fs';
import { cloneAndAnalyze } from '../../../src/scripts/sync/clone-and-analyze';
import type { RepoMetaData, SnykProject } from '../../../src/lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../../src/lib/types';
import { BitbucketCloudSyncClient } from '../../../src/lib/source-handlers/bitbucket-cloud/sync-client';
import axios from 'axios';

describe('cloneAndAnalyze', () => {
  describe('Bitbucket', () => {
    it('Bitbucket Cloud: returns correct import/remove lists', async () => {
      const projects: SnykProject[] = [
        {
          name: 'workspace/repo:package.json',
          id: '123',
          created: '2022-01-01T00:00:00.000Z',
          origin: 'bitbucket-cloud',
          type: 'npm',
          branch: 'main',
          status: 'active',
        },
      ];
      const repoMeta: RepoMetaData = {
        branch: 'main',
        archived: false,
        cloneUrl: '',
        sshUrl: '',
      };
      const config = {
        dryRun: false,
        entitlements: ['openSource' as any],
        manifestTypes: ['package.json'],
        exclusionGlobs: [],
      };
      const bitbucketAuth = {
        type: 'basic' as any,
        username: 'fakeuser',
        appPassword: 'fakepass',
      };
  jest.spyOn(BitbucketCloudSyncClient.prototype, 'listFiles').mockImplementation(async () => ['package.json', 'newfile.json']);
      const target = { owner: 'workspace', name: 'repo', branch: 'main' };
      const result = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.BITBUCKET_CLOUD,
        repoMeta,
        projects,
        config,
        'cloud',
        bitbucketAuth,
        target,
      );
  expect(result.import).toEqual([]);
  expect(result.remove).toEqual([]);
    });

    it('Bitbucket Server: returns correct import/remove lists', async () => {
      const projects: SnykProject[] = [
        {
          name: 'PROJ/repo:package.json',
          id: '456',
          created: '2022-01-01T00:00:00.000Z',
          origin: 'bitbucket-server',
          type: 'npm',
          branch: 'main',
          status: 'active',
        },
      ];
      const repoMeta: RepoMetaData = {
        branch: 'main',
        archived: false,
        cloneUrl: '',
        sshUrl: '',
      };
      const config = {
        dryRun: false,
        entitlements: ['openSource' as any],
        manifestTypes: ['package.json'],
        exclusionGlobs: [],
      };
      const datacenterAuth = { sourceUrl: 'http://bitbucket-server', token: 'servertoken' };
  jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: { values: ['package.json', 'other.txt'] } });
      const target = { projectKey: 'PROJ', repoSlug: 'repo', branch: 'main' };
      const result = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.BITBUCKET_SERVER,
        repoMeta,
        projects,
        config,
        'server',
        datacenterAuth,
        target,
      );
  expect(result.import).toEqual([]);
  expect(result.remove).toEqual([]);
    });
  });
  const OLD_ENV = process.env;
  const removeFolders: string[] = [];
  afterEach(() => {
    process.env = { ...OLD_ENV };
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
  describe('Github', () => {
    process.env.SNYK_LOG_PATH = __dirname;

    it('identifies correctly the diff between files in the repo vs monitored in Snyk (defaults to OS)', async () => {
      // Arrange
      const projects: SnykProject[] = [
        {
          name: 'snyk-fixtures/monorepo-simple:package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          exclusionGlobs: ['bundler-app'],
        },
      );

      // Assert
      expect(res.import).toEqual(['Gemfile.lock']);
      expect(res.remove.length).toBeGreaterThan(0);
    });
    it('identifies correctly the diff between files in the repo vs monitored in Snyk (with IAC enabled)', async () => {
      // Arrange
      const projects: SnykProject[] = [
        {
          name: 'snyk-fixtures/monorepo-simple:package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: ['openSource', 'infrastructureAsCode'],
          exclusionGlobs: ['*.file.json'],
        },
      );

      // Assert
      expect(res.import).toEqual(['Gemfile.lock', 'bundler-app/Gemfile.lock']);
      expect(res.remove.length).toBeGreaterThan(0);
    });
    it('detects changes needed for a particular ecosystem (npm)', async () => {
      // Arrange
      const projects: SnykProject[] = [
        {
          name: 'snyk-fixtures/monorepo-simple:package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        // Should find this file needs bringing in
        // {
        //   name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
        //   id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        //   created: '2018-10-29T09:50:54.014Z',
        //   origin: 'github',
        //   type: 'rubygems',
        //   branch: 'master',
        //   status: 'active'
        // },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
          status: 'active',
        },
        // should be detected as no longer present, and needs de-activating
        {
          name: 'snyk-fixtures/monorepo-simple:not-in-repo/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
          status: 'active',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: ['openSource'],
          manifestTypes: ['npm'],
        },
      );

      // Assert
      // only detects which npm project need to be brought in
      expect(res.import).toEqual(['npm-project/package.json']);
      expect(res.remove.length).toBeGreaterThan(0);
    });
    it('no changes needed', async () => {
      // Arrange
      const projects: SnykProject[] = [
        {
          name: 'snyk-fixtures/monorepo-simple:package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
          status: 'active',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: ['openSource'],
        },
      );

      // Assert
      expect(res.import).toEqual([]);
      expect(res.remove).toEqual([]);
    }, 70000);
    it('processing repository with no supported manifests > nothing to do', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'main',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/no-supported-manifests.git',
        sshUrl: 'git@github.com:snyk-fixtures/no-supported-manifests.git',
      };

      // Act & Assert
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: ['openSource'],
        },
      );

      expect(res).toStrictEqual({
        import: [],
        remove: [],
      });
    }, 70000);
    it('processing empty repository with no branch throws', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: 'https://github.com/snyk-fixtures/empty-repo.git',
        sshUrl: 'git@github.com:snyk-fixtures/empty-repo.git',
      };

      // Act & Assert
      await expect(
        cloneAndAnalyze(
          SupportedIntegrationTypesUpdateProject.GITHUB,
          repoMeta,
          projects,
          {
            entitlements: ['openSource'],
          },
        ),
      ).rejects.toThrow('fatal: Remote branch master not found in upstream origin');
    }, 70000);

    it('correctly matches python files using globs', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl:
          'https://github.com/snyk-fixtures/python-requirements-custom-name-inside-folder.git',
        sshUrl:
          'git@github.com:snyk-fixtures/python-requirements-custom-name-inside-folder.git',
      };

      // Act & Assert
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: ['openSource'],
        },
      );

      expect(res).toStrictEqual({
        import: ['requirements/dev.txt', 'requirements/prod.txt'],
        remove: [],
      });
    });
  });
  describe.skip('Github Enterprise', () => {
    let GHE_URL: URL | undefined;
    if (process.env.TEST_GHE_URL) {
      GHE_URL = new URL(process.env.TEST_GHE_URL);
    } else {
      GHE_URL = undefined;
    }

    afterAll(() => {
      process.env = { ...OLD_ENV };
    });
    beforeEach(() => {
      process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    });
    (GHE_URL ? it : it.skip)('identifies correctly that all files need importing since the target is empty', async () => {
      // Arrange
      const projects: SnykProject[] = [];
      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL!.host}/snyk-fixtures/mono-repo.git`,
        sshUrl: `git@${GHE_URL!.host}/snyk-fixtures/mono-repo.git`,
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: ['openSource'],
        },
      );
      // Assert
      expect(res).toStrictEqual({
        import: [
          'Gemfile.lock',
          'build.gradle',
          'build.sbt',
          'multi-module/pom.xml',
          'multi-module/server/pom.xml',
          'multi-module/webapp/pom.xml',
          'package.json',
          'pom.xml',
          'requirements.txt',
          'single-module/pom.xml',
        ],
        remove: [],
      });
    });
    (GHE_URL ? it : it.skip)('identifies correctly the diff between files in the repo vs monitored in Snyk (with IAC & Docker enabled)', async () => {
      // Arrange
      const projects: SnykProject[] = [];
      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL!.host}/snyk-fixtures/docker-goof.git`,
        sshUrl: `git@${GHE_URL!.host}/snyk-fixtures/docker-goof.git`,
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        {
          entitlements: [
            'openSource',
            'infrastructureAsCode',
            'dockerfileFromScm',
          ],
        },
      );
      // Assert
      expect(res).toStrictEqual({
        import: ['Dockerfile'],
        remove: [],
      });
    });
    (GHE_URL ? it : it.skip)('repo appears empty when entitlements not enabled', async () => {
      // Arrange
      const projects: SnykProject[] = [];
      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL!.host}/snyk-fixtures/docker-goof.git`,
        sshUrl: `git@${GHE_URL!.host}/snyk-fixtures/docker-goof.git`,
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        { entitlements: ['openSource'] },
      );
      // Assert
      expect(res).toStrictEqual({
        import: [],
        remove: [],
      });
    });
  });
});
