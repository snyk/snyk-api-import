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
        fs.rmdirSync(f, { recursive: true });
      } catch (e) {
        console.log('Failed to clean up test', e);
      }
    }
  });
  describe('Github', () => {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
    process.env.SNYK_LOG_PATH = __dirname;

    it('identifies correctly the diff between files in the repo vs monitored in Snyk', async () => {
      // Arrange
      const projects: SnykProject[] = [
        {
          name: 'snyk-fixtures/monorepo-simple:package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        [],
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        import: ['Gemfile.lock', 'bundler-app/Gemfile.lock'],
        deactivate: [],
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
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        ['infrastructureAsCode'],
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        import: [
          'Gemfile.lock',
          'bundler-app/Gemfile.lock',
          'package-2.file.json',
        ],
        deactivate: [],
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
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        // Should find this file needs bringing in
        // {
        //   name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
        //   id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        //   created: '2018-10-29T09:50:54.014Z',
        //   origin: 'github',
        //   type: 'rubygems',
        //   branch: 'master',
        // },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        },
        // should be detected as no longer present, and needs de-activating
        {
          name: 'snyk-fixtures/monorepo-simple:not-in-repo/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        [],
        ['npm'],
      );

      // Assert
      // only detects which npm project need to be brought in
      expect(res).toStrictEqual({
        import: ['npm-project/package.json'],
        deactivate: [
          {
            name: 'snyk-fixtures/monorepo-simple:not-in-repo/package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
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
        },
        {
          name: 'snyk-fixtures/monorepo-simple:Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:no-vulns-bundler-app/Gemfile.lock',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
        {
          name: 'snyk-fixtures/monorepo-simple:npm-project-with-policy/package.json',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'rubygems',
          branch: 'master',
        },
      ];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: 'https://github.com/snyk-fixtures/monorepo-simple.git',
        sshUrl: 'git@github.com:snyk-fixtures/monorepo-simple.git',
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        [],
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        import: [],
        deactivate: [],
      });
    }, 70000);
    it('processing repository with no supported manifests > nothing to do', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'main',
        cloneUrl: 'https://github.com/snyk-fixtures/no-supported-manifests.git',
        sshUrl: 'git@github.com:snyk-fixtures/no-supported-manifests.git',
      };

      // Act & Assert
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        [],
        undefined,
      );

      expect(res).toStrictEqual({
        import: [],
        deactivate: [],
      });
    }, 70000);
    it('processing empty repository with no branch throws', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: 'https://github.com/snyk-fixtures/empty-repo.git',
        sshUrl: 'git@github.com:snyk-fixtures/empty-repo.git',
      };

      // Act & Assert
      await expect(
        cloneAndAnalyze(
          SupportedIntegrationTypesUpdateProject.GITHUB,
          repoMeta,
          projects,
          undefined,
          [],
          undefined,
        ),
      ).rejects.toThrowError(
        'fatal: Remote branch master not found in upstream origin',
      );
    }, 70000);
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
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/mono-repo.git`,
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        [],
        undefined,
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
        deactivate: [],
      });
    });
    it('identifies correctly the diff between files in the repo vs monitored in Snyk (with IAC & Docker enabled)', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        ['infrastructureAsCode', 'dockerfileFromScm'],
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        import: ['Dockerfile'],
        deactivate: [],
      });
    });
    it('repo appears empty when entitlements not enabled', async () => {
      // Arrange
      const projects: SnykProject[] = [];

      const repoMeta: RepoMetaData = {
        branch: 'master',
        cloneUrl: `https://${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
        sshUrl: `git@${GHE_URL.host}/snyk-fixtures/docker-goof.git`,
      };
      // Act
      const res = await cloneAndAnalyze(
        SupportedIntegrationTypesUpdateProject.GITHUB,
        repoMeta,
        projects,
        undefined,
        [],
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        import: [],
        deactivate: [],
      });
    });
  });
});
