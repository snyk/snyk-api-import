import * as fs from 'fs';

import { cloneAndAnalyze } from '../../../src/scripts/sync/clone-and-analyze';
import type { RepoMetaData, SnykProject } from '../../../src/lib/types';

import { SupportedIntegrationTypesUpdateProject } from '../../../src/lib/types';

describe('cloneAndAnalyze', () => {
  const OLD_ENV = process.env;
  const removeFolders: string[] = [];
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    for (const f of removeFolders) {
      try {
        fs.rmdirSync(f, { recursive: true, maxRetries: 3 });
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
      expect(res).toStrictEqual({
        import: ['Gemfile.lock'],
        remove: [],
      });
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
      expect(res).toStrictEqual({
        import: ['Gemfile.lock', 'bundler-app/Gemfile.lock'],
        remove: [],
      });
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
      expect(res).toStrictEqual({
        import: ['npm-project/package.json'],
        remove: [
          {
            name: 'snyk-fixtures/monorepo-simple:not-in-repo/package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
        ],
      });
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
      expect(res).toStrictEqual({
        import: [],
        remove: [],
      });
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
      ).rejects.toThrowError(
        'fatal: Remote branch master not found in upstream origin',
      );
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
  describe('Github Enterprise', () => {
    const GHE_URL = new URL(process.env.TEST_GHE_URL!);

    afterAll(() => {
      process.env = { ...OLD_ENV };
    });
    beforeEach(() => {
      process.env.GITHUB_TOKEN = process.env.TEST_GHE_TOKEN;
    });
    it('identifies correctly that all files need importing since the target is empty', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
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
    it('identifies correctly the diff between files in the repo vs monitored in Snyk (with IAC & Docker enabled)', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
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
    it('repo appears empty when entitlements not enabled', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        archived: false,
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
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
