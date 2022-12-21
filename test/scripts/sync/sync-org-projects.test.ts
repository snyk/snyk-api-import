import { requestsManager } from 'snyk-request-manager';
import * as uuid from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import {
  updateOrgTargets,
  updateTargets,
} from '../../../src/scripts/sync/sync-org-projects';
import type { ProjectsResponse } from '../../../src/lib/api/org';
import type * as syncProjectsForTarget from '../../../src/scripts/sync/sync-projects-per-target';
import type {
  Project,
  SnykProject,
  SnykTarget,
  SnykTargetRelationships,
} from '../../../src/lib/types';
import { ProjectUpdateType } from '../../../src/lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../../src/lib/types';
import * as lib from '../../../src/lib';
import * as clone from '../../../src/scripts/sync/clone-and-analyze';
import * as projectApi from '../../../src/lib/api/project';
import * as github from '../../../src/lib/source-handlers/github';
import * as featureFlags from '../../../src/lib/api/feature-flags';
import * as updateProjectsLog from '../../../src/loggers/log-updated-project';
import * as importTarget from '../../../src/scripts/sync/import-target';
import { deleteFiles } from '../../delete-files';
import { generateLogsPaths } from '../../generate-log-file-names';
import { bulkImportTargetFiles } from '../../../src/scripts/sync/sync-projects-per-target';
import type { FailedProject } from '../../../src/loggers/log-failed-projects';
const fixturesFolderPath = path.resolve(__dirname, '../') + '/fixtures/repos';

describe('updateTargets', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = './';
  process.env.SNYK_TOKEN = 'dummy';
  process.env.GITHUB_TOKEN = 'dummy';

  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  let githubSpy: jest.SpyInstance;
  let updateProjectsSpy: jest.SpyInstance;
  let listProjectsSpy: jest.SpyInstance;
  let cloneSpy: jest.SpyInstance;
  let deactivateProjectsSpy: jest.SpyInstance;

  beforeAll(() => {
    githubSpy = jest.spyOn(github, 'getGithubRepoMetaData');
    updateProjectsSpy = jest.spyOn(projectApi, 'updateProject');
    deactivateProjectsSpy = jest
      .spyOn(lib, 'deactivateProject')
      .mockImplementation(() => Promise.resolve(true));
    listProjectsSpy = jest.spyOn(lib, 'listProjects');
    cloneSpy = jest.spyOn(lib, 'gitClone');
    jest.spyOn(fs, 'rmdirSync').mockImplementation(() => true);
  }, 1000);

  afterAll(async () => {
    jest.restoreAllMocks();
  }, 1000);

  beforeEach(async () => {
    jest.clearAllMocks();
  }, 1000);

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });
  describe('Github', () => {
    it('Removed projects that were accidentally added from `node_modules`', async () => {
      const testTargets = [
        {
          attributes: {
            displayName: 'snyk/monorepo',
            isPrivate: false,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          relationships: {
            org: {
              data: {
                id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
                type: 'org',
              },
              links: {},
              meta: {},
            },
          },
          type: 'target',
        },
      ];
      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';
      const projectsAPIResponse: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/monorepo:build.gradle',
            id: '3626066d-21a7-424f-b6fc-dc0d222d8e4a',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
          {
            name: 'snyk/monorepo(main):package.json',
            id: 'f57afea5-8fed-41d8-a8fd-d374c0944b07',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
          {
            name: 'snyk/monorepo:node_modules/package.json',
            id: 'dc0d222d8e4a-8fed-41d8-a8fd-d374c0944b07',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
        ],
      };

      const defaultBranch = 'develop';
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: projectsAPIResponse.projects[0].id,
          from: projectsAPIResponse.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
          target: testTargets[0],
        },
        {
          projectPublicId: projectsAPIResponse.projects[2].id,
          from: 'active',
          to: 'deactivated',
          type: ProjectUpdateType.DEACTIVATE,
          dryRun: false,
          target: testTargets[0],
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [
        {
          errorMessage:
            'Failed to update project f57afea5-8fed-41d8-a8fd-d374c0944b07 via Snyk API. ERROR: Error',
          projectPublicId: projectsAPIResponse.projects[1].id,
          from: projectsAPIResponse.projects[1].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
          target: testTargets[0],
        },
      ];

      listProjectsSpy.mockImplementation(() =>
        Promise.resolve(projectsAPIResponse),
      );
      githubSpy.mockImplementation(() =>
        Promise.resolve({
          branch: defaultBranch,
          cloneUrl: 'https://some-url.com',
          sshUrl: 'git@some-url.com',
        }),
      );
      updateProjectsSpy
        .mockImplementationOnce(() =>
          Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
        )
        .mockImplementationOnce(() =>
          Promise.reject({ statusCode: '404', message: 'Error' }),
        );
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'monorepo'),
          gitResponse: '',
        }),
      );
      // Act
      const res = await updateTargets(
        requestManager,
        orgId,
        testTargets,
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        processedTargets: 1,
        failedTargets: 0,
        meta: {
          projects: expect.anything(),
        },
      });
      expect(deactivateProjectsSpy).toHaveBeenCalled();
      expect(res.meta.projects.updated.sort()).toStrictEqual(updated.sort());
      expect(res.meta.projects.failed.sort()).toStrictEqual(failed.sort());
    }, 5000);

    it('updates a projects branch if default branch changed', async () => {
      // Arrange
      const testTarget = [
        {
          attributes: {
            displayName: 'test',
            isPrivate: false,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          relationships: {
            org: {
              data: {
                id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
                type: 'org',
              },
              links: {},
              meta: {},
            },
          },
          type: 'target',
        },
      ];

      const projectsAPIResponse: ProjectsResponse = {
        org: {
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        },
        projects: [
          {
            name: 'snyk/goof:package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
          {
            name: 'snyk/goof:deactivated/package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'inactive',
          },
        ],
      };

      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';
      const defaultBranch = 'develop';

      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          from: projectsAPIResponse.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [];

      jest
        .spyOn(lib, 'listProjects')
        .mockImplementation(() => Promise.resolve(projectsAPIResponse));
      githubSpy.mockImplementation(() =>
        Promise.resolve({
          branch: defaultBranch,
          cloneUrl: 'https://some-url.com',
          sshUrl: 'git@some-url.com',
        }),
      );
      updateProjectsSpy.mockImplementation(() =>
        Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
      );
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'goof'),
          gitResponse: '',
        }),
      );
      // Act
      const res = await updateTargets(
        requestManager,
        orgId,
        testTarget,
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        failedTargets: 0,
        processedTargets: 1,
        meta: {
          projects: {
            failed: failed.map((f) => ({ ...f, target: testTarget[0] })),
            updated: updated.map((u) => ({ ...u, target: testTarget[0] })),
          },
        },
      });
    }, 10000);
    it('deactivates a project if it matches exclusion globs', async () => {
      // Arrange
      const testTarget = [
        {
          attributes: {
            displayName: 'test',
            isPrivate: false,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          relationships: {
            org: {
              data: {
                id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
                type: 'org',
              },
              links: {},
              meta: {},
            },
          },
          type: 'target',
        },
      ];

      const projectsAPIResponse: ProjectsResponse = {
        org: {
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        },
        projects: [
          {
            name: 'snyk/goof:package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
          {
            name: 'snyk/goof:deactivated/package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'inactive',
          },
        ],
      };

      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';
      const defaultBranch = 'develop';

      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          from: 'active',
          to: 'deactivated',
          type: ProjectUpdateType.DEACTIVATE,
          dryRun: false,
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [];

      jest
        .spyOn(lib, 'listProjects')
        .mockImplementation(() => Promise.resolve(projectsAPIResponse));
      githubSpy.mockImplementation(() =>
        Promise.resolve({
          branch: defaultBranch,
          cloneUrl: 'https://some-url.com',
          sshUrl: 'git@some-url.com',
        }),
      );
      updateProjectsSpy.mockImplementation(() =>
        Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
      );
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'goof'),
          gitResponse: '',
        }),
      );
      // Act
      const res = await updateTargets(
        requestManager,
        orgId,
        testTarget,
        undefined,
        {
          dryRun: false,
          exclusionGlobs: ['**/package.json'],
        },
      );

      // Assert
      expect(res).toStrictEqual({
        failedTargets: 0,
        processedTargets: 1,
        meta: {
          projects: {
            failed: failed.map((f) => ({ ...f, target: testTarget[0] })),
            updated: updated.map((u) => ({ ...u, target: testTarget[0] })),
          },
        },
      });
    }, 10000);

    it('did not need to update a projects branch', async () => {
      // Arrange
      const testTarget = [
        {
          attributes: {
            displayName: 'test',
            isPrivate: false,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          relationships: {
            org: {
              data: {
                id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
                type: 'org',
              },
              links: {},
              meta: {},
            },
          },
          type: 'target',
        },
      ];

      const projectsAPIResponse: ProjectsResponse = {
        org: {
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        },
        projects: [
          {
            name: 'snyk/goof:package.json',
            id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
        ],
      };

      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';

      const defaultBranch = projectsAPIResponse.projects[0].branch;

      listProjectsSpy.mockImplementation(() =>
        Promise.resolve(projectsAPIResponse),
      );
      githubSpy.mockImplementation(() =>
        Promise.resolve({
          branch: defaultBranch,
          cloneUrl: 'https://some-url.com',
          sshUrl: 'git@some-url.com',
        }),
      );
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'goof'),
          gitResponse: '',
        }),
      );
      updateProjectsSpy.mockImplementation(() =>
        Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
      );

      // Act
      const res = await updateTargets(
        requestManager,
        orgId,
        testTarget,
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        failedTargets: 0,
        processedTargets: 1,
        meta: {
          projects: {
            failed: [],
            updated: [],
          },
        },
      });
    }, 5000);

    it('updates several projects from the same target 1 failed 1 success', async () => {
      // Arrange
      const testTargets = [
        {
          attributes: {
            displayName: 'snyk/monorepo',
            isPrivate: false,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          relationships: {
            org: {
              data: {
                id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
                type: 'org',
              },
              links: {},
              meta: {},
            },
          },
          type: 'target',
        },
      ];
      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';
      const projectsAPIResponse: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/monorepo:build.gradle',
            id: '3626066d-21a7-424f-b6fc-dc0d222d8e4a',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
          {
            name: 'snyk/monorepo(main):package.json',
            id: 'f57afea5-8fed-41d8-a8fd-d374c0944b07',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'maven',
            branch: 'master',
            status: 'active',
          },
        ],
      };

      const defaultBranch = 'develop';
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: projectsAPIResponse.projects[0].id,
          from: projectsAPIResponse.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [
        {
          errorMessage:
            'Failed to update project f57afea5-8fed-41d8-a8fd-d374c0944b07 via Snyk API. ERROR: Error',
          projectPublicId: projectsAPIResponse.projects[1].id,
          from: projectsAPIResponse.projects[1].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
        },
      ];

      listProjectsSpy.mockImplementation(() =>
        Promise.resolve(projectsAPIResponse),
      );
      githubSpy.mockImplementation(() =>
        Promise.resolve({
          branch: defaultBranch,
          cloneUrl: 'https://some-url.com',
          sshUrl: 'git@some-url.com',
        }),
      );
      updateProjectsSpy
        .mockImplementationOnce(() =>
          Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
        )
        .mockImplementationOnce(() =>
          Promise.reject({ statusCode: '404', message: 'Error' }),
        );
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'monorepo'),
          gitResponse: '',
        }),
      );
      // Act
      const res = await updateTargets(
        requestManager,
        orgId,
        testTargets,
        undefined,
      );

      // Assert
      expect(res).toStrictEqual({
        processedTargets: 1,
        failedTargets: 0,
        meta: {
          projects: {
            updated: updated.map((u) => ({ ...u, target: testTargets[0] })),
            failed: failed.map((f) => ({ ...f, target: testTargets[0] })),
          },
        },
      });
    }, 5000);
  });
  describe('Github Enterprise', () => {
    it('updates several projects from the same target 1 failed 1 success', async () => {
      // Arrange
      const testTargets = [
        {
          attributes: {
            displayName: 'snyk/monorepo',
            isPrivate: false,
            origin: 'github-enterprise',
            remoteUrl: null,
          },
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          relationships: {
            org: {
              data: {
                id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
                type: 'org',
              },
              links: {},
              meta: {},
            },
          },
          type: 'target',
        },
      ];
      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';
      const projectsAPIResponse: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/monorepo:build.gradle',
            id: '3626066d-21a7-424f-b6fc-dc0d222d8e4a',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'npm',
            branch: 'master',
            status: 'active',
          },
          {
            name: 'snyk/monorepo(main):package.json',
            id: 'f57afea5-8fed-41d8-a8fd-d374c0944b07',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'maven',
            branch: 'master',
            status: 'active',
          },
        ],
      };

      const defaultBranch = 'develop';
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: projectsAPIResponse.projects[0].id,
          from: projectsAPIResponse.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [
        {
          errorMessage:
            'Failed to update project f57afea5-8fed-41d8-a8fd-d374c0944b07 via Snyk API. ERROR: Error',
          projectPublicId: projectsAPIResponse.projects[1].id,
          from: projectsAPIResponse.projects[1].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: false,
        },
      ];

      listProjectsSpy.mockImplementation(() =>
        Promise.resolve(projectsAPIResponse),
      );
      githubSpy.mockImplementation(() =>
        Promise.resolve({
          branch: defaultBranch,
          cloneUrl: 'https://some-url.com',
          sshUrl: 'git@some-url.com',
        }),
      );
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'monorepo'),
          gitResponse: '',
        }),
      );
      updateProjectsSpy
        .mockImplementationOnce(() =>
          Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
        )
        .mockImplementationOnce(() =>
          Promise.reject({ statusCode: '404', message: 'Error' }),
        );
      // Act
      const res = await updateTargets(
        requestManager,
        orgId,
        testTargets,
        'https://custom-ghe.com',
        {
          dryRun: false,
        },
      );

      // Assert
      expect(res).toStrictEqual({
        failedTargets: 0,
        processedTargets: 1,
        meta: {
          projects: {
            updated: updated.map((u) => ({ ...u, target: testTargets[0] })),
            failed: failed.map((f) => ({ ...f, target: testTargets[0] })),
          },
        },
      });

      expect(githubSpy).toBeCalledWith(
        {
          branch: 'master',
          name: 'monorepo',
          owner: 'snyk',
        },
        'https://custom-ghe.com',
      );
      expect(deactivateProjectsSpy).not.toHaveBeenCalled();
    }, 5000);
  });
});
describe('updateOrgTargets', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = './';
  process.env.SNYK_TOKEN = 'dummy';

  let featureFlagsSpy: jest.SpyInstance;
  let listTargetsSpy: jest.SpyInstance;
  let listProjectsSpy: jest.SpyInstance;
  let logUpdatedProjectsSpy: jest.SpyInstance;
  let githubSpy: jest.SpyInstance;
  let updateProjectSpy: jest.SpyInstance;
  let deactivateProjectSpy: jest.SpyInstance;
  let cloneAndAnalyzeSpy: jest.SpyInstance;

  let cloneSpy: jest.SpyInstance;

  beforeAll(() => {
    featureFlagsSpy = jest.spyOn(featureFlags, 'getFeatureFlag');
    listTargetsSpy = jest.spyOn(lib, 'listTargets');
    listProjectsSpy = jest.spyOn(lib, 'listProjects');
    logUpdatedProjectsSpy = jest.spyOn(updateProjectsLog, 'logUpdatedProjects');
    githubSpy = jest.spyOn(github, 'getGithubRepoMetaData');
    updateProjectSpy = jest.spyOn(projectApi, 'updateProject');
    deactivateProjectSpy = jest.spyOn(projectApi, 'deactivateProject');
    cloneSpy = jest.spyOn(lib, 'gitClone');
    cloneAndAnalyzeSpy = jest.spyOn(clone, 'cloneAndAnalyze');
    jest.spyOn(fs, 'rmdirSync').mockImplementation(() => true);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  }, 1000);

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Errors', () => {
    it('throws if only unsupported origins requested', async () => {
      await expect(
        updateOrgTargets('xxx', ['unsupported' as any], undefined),
      ).rejects.toThrowError(
        'Nothing to sync, stopping. Sync command currently only supports the following sources: github',
      );
    });
    it('throws if the organization uses the customBranch FF', async () => {
      featureFlagsSpy.mockResolvedValue(true);
      await expect(
        updateOrgTargets(
          'xxx',
          [SupportedIntegrationTypesUpdateProject.GITHUB],
          undefined,
        ),
      ).rejects.toThrowError(
        'Detected custom branches feature. Skipping syncing organization xxx because it is not possible to determine which should be the default branch.',
      );
    });

    it('skips target if listingProjects has API error', async () => {
      const targets: SnykTarget[] = [
        {
          attributes: {
            displayName: 'foo/bar',
            isPrivate: true,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'xxx',
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
        {
          attributes: {
            displayName: 'snyk/bar',
            isPrivate: true,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'xxx',
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy
        .mockRejectedValueOnce(
          'Expected a 200 response, instead received:' +
            JSON.stringify({
              statusCode: 500,
              message: 'Something went wrong',
            }),
        )
        .mockRejectedValueOnce(() =>
          Promise.resolve({
            org: {
              id: 'xxx',
            },
            projects: [],
          }),
        );
      logUpdatedProjectsSpy.mockResolvedValue(null);

      const res = await updateOrgTargets(
        'xxx',
        [SupportedIntegrationTypesUpdateProject.GITHUB],
        undefined,
      );
      expect(res).toStrictEqual({
        failedFileName: undefined,
        fileName: expect.stringMatching('.updated-projects.log'),
        meta: {
          projects: {
            failed: [],
            updated: [],
          },
        },
        processedTargets: 0,
        failedTargets: 2,
      });
    });
  });

  describe('Github', () => {
    it('github is not configured', async () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;
      const targets: SnykTarget[] = [
        {
          attributes: {
            displayName: 'foo/bar',
            isPrivate: true,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'xxx',
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
      ];
      const projects: SnykProject[] = [
        {
          name: 'example',
          id: '123',
          created: 'date',
          origin: 'github',
          type: 'npm',
          branch: 'main',
          status: 'active',
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      // Act
      await expect(() =>
        updateOrgTargets(
          'xxx',
          [SupportedIntegrationTypesUpdateProject.GITHUB],
          undefined,
        ),
      ).rejects.toThrowError(
        "Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'",
      );

      // Assert
    });
    it.todo('skips extra unsupported source, but finishes supported');
    it('skips target & projects error if getting default branch fails', async () => {
      // Arrange
      const targets: SnykTarget[] = [
        {
          attributes: {
            displayName: 'foo/bar',
            isPrivate: true,
            origin: 'github',
            remoteUrl: null,
          },
          id: 'xxx',
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
      ];
      const projects: SnykProject[] = [
        {
          name: 'example',
          id: '123',
          created: 'date',
          origin: 'github',
          type: 'npm',
          branch: 'main',
          status: 'active',
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      // Act
      const res = await updateOrgTargets(
        'xxx',
        [SupportedIntegrationTypesUpdateProject.GITHUB],
        undefined,
      );

      expect(res).toStrictEqual({
        failedFileName: undefined,
        fileName: expect.stringMatching('.updated-projects.log'),
        meta: {
          projects: {
            updated: [],
            failed: [],
          },
        },
        processedTargets: 0,
        failedTargets: 1,
      });
    });

    it('successfully updated several targets (dryRun mode)', async () => {
      // Arrange
      const targets: SnykTarget[] = [
        {
          attributes: {
            displayName: 'snyk/bar',
            isPrivate: true,
            origin: 'github',
            remoteUrl: null,
          },
          id: uuid.v4(),
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
        {
          attributes: {
            displayName: 'snyk/foo',
            isPrivate: false,
            origin: 'github',
            remoteUrl: null,
          },
          id: uuid.v4(),
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
      ];
      const updatedProjectId1 = uuid.v4();
      const updatedProjectId2 = uuid.v4();
      const deletedProjectId = uuid.v4();

      const orgId = uuid.v4();
      const projectsAPIResponse1: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/bar:package.json',
            id: updatedProjectId1,
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'npm',
            branch: 'main',
            status: 'active',
          },
          {
            name: 'snyk/bar:deleted/package.json',
            id: deletedProjectId,
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'npm',
            branch: 'main',
            status: 'active',
          },
        ],
      };
      const projectsAPIResponse2: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/bar:package.json',
            id: updatedProjectId2,
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'yarn',
            branch: 'develop',
            status: 'active',
          },
        ],
      };
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy
        .mockResolvedValueOnce(projectsAPIResponse1)
        .mockResolvedValueOnce(projectsAPIResponse2);

      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      const defaultBranch = 'new-branch';
      githubSpy.mockResolvedValue({
        branch: defaultBranch,
        cloneUrl: 'https://some-url.com',
        sshUrl: 'git@some-url.com',
      });
      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'goof'),
          gitResponse: '',
        }),
      );
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: updatedProjectId1,
          from: projectsAPIResponse1.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: true,
          target: targets[0],
        },
        {
          projectPublicId: deletedProjectId,
          from: 'active',
          to: 'deactivated',
          type: ProjectUpdateType.DEACTIVATE,
          dryRun: true,
          target: targets[0],
        },
        {
          projectPublicId: updatedProjectId2,
          from: projectsAPIResponse2.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: true,
          target: targets[1],
        },
      ];
      // Act
      const res = await updateOrgTargets(
        'xxx',
        [SupportedIntegrationTypesUpdateProject.GITHUB],
        undefined,
        {
          dryRun: true,
          // exclusionGlobs: ['to-ignore']
        },
      );
      // Assert
      expect(res).toStrictEqual({
        failedFileName: undefined,
        fileName: expect.stringMatching('.updated-projects.log'),
        meta: {
          projects: expect.anything(),
        },
        processedTargets: 2,
        failedTargets: 0,
      });

      expect(
        res.meta.projects.updated.map((p) => p.projectPublicId).sort(),
      ).toEqual(updated.map((p) => p.projectPublicId).sort());
      expect(res.meta.projects.updated.map((p) => p.type).sort()).toEqual(
        updated.map((p) => p.type).sort(),
      );

      expect(cloneAndAnalyzeSpy).toHaveBeenCalledTimes(2);
      expect(res.meta.projects.failed).toEqual([]);
      expect(featureFlagsSpy).toHaveBeenCalledTimes(1);
      expect(listTargetsSpy).toHaveBeenCalledTimes(1);
      expect(listProjectsSpy).toHaveBeenCalledTimes(2);
      expect(githubSpy).toBeCalledTimes(2);
      expect(updateProjectSpy).not.toHaveBeenCalled();
      expect(deactivateProjectSpy).not.toHaveBeenCalled();
      expect(logUpdatedProjectsSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Github Enterprise', () => {
    it('github enterprise is not configured', async () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;
      const targets: SnykTarget[] = [
        {
          attributes: {
            displayName: 'foo/bar',
            isPrivate: true,
            origin: 'github-enterprise',
            remoteUrl: null,
          },
          id: 'xxx',
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
      ];
      const projects: SnykProject[] = [
        {
          name: 'example',
          id: '123',
          created: 'date',
          origin: 'github-enterprise',
          type: 'npm',
          branch: 'main',
          status: 'active',
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      // Act & Assert
      await expect(() =>
        updateOrgTargets(
          'xxx',
          [SupportedIntegrationTypesUpdateProject.GHE],
          undefined,
        ),
      ).rejects.toThrowError(
        "Please set the GITHUB_TOKEN e.g. export GITHUB_TOKEN='mypersonalaccesstoken123'",
      );
    });
    it('successfully updated several targets (dryRun mode)', async () => {
      // Arrange
      const targets: SnykTarget[] = [
        {
          attributes: {
            displayName: 'snyk/bar',
            isPrivate: true,
            origin: 'github-enterprise',
            remoteUrl: null,
          },
          id: uuid.v4(),
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
        {
          attributes: {
            displayName: 'snyk/foo',
            isPrivate: false,
            origin: 'github-enterprise',
            remoteUrl: null,
          },
          id: uuid.v4(),
          relationships: {} as unknown as SnykTargetRelationships,
          type: 'target',
        },
      ];
      const updatedProjectId1 = uuid.v4();
      const updatedProjectId2 = uuid.v4();
      const orgId = uuid.v4();
      const projectsAPIResponse1: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/bar:package.json',
            id: updatedProjectId1,
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'npm',
            branch: 'main',
            status: 'active',
          },
        ],
      };
      const projectsAPIResponse2: ProjectsResponse = {
        org: {
          id: orgId,
        },
        projects: [
          {
            name: 'snyk/foo:package.json',
            id: updatedProjectId2,
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'yarn',
            branch: 'develop',
            status: 'active',
          },
        ],
      };
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy
        .mockResolvedValueOnce(projectsAPIResponse1)
        .mockResolvedValueOnce(projectsAPIResponse2);

      cloneSpy.mockImplementation(() =>
        Promise.resolve({
          success: true,
          repoPath: path.resolve(fixturesFolderPath, 'goof'),
          gitResponse: '',
        }),
      );
      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      const defaultBranch = 'new-branch';
      githubSpy.mockResolvedValue({
        branch: defaultBranch,
        cloneUrl: 'https://some-url.com',
        sshUrl: 'git@some-url.com',
      });
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: updatedProjectId1,
          from: projectsAPIResponse1.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: true,
          target: targets[0],
        },
        {
          projectPublicId: updatedProjectId2,
          from: projectsAPIResponse2.projects[0].branch!,
          to: defaultBranch,
          type: ProjectUpdateType.BRANCH,
          dryRun: true,
          target: targets[1],
        },
      ];
      // Act
      const res = await updateOrgTargets(
        'xxx',
        [SupportedIntegrationTypesUpdateProject.GHE],
        'https://custom.ghe.com',
        {
          dryRun: true,
        },
      );
      // Assert
      expect(res).toStrictEqual({
        failedFileName: undefined,
        fileName: expect.stringMatching('.updated-projects.log'),
        meta: {
          projects: expect.anything(),
        },
        processedTargets: 2,
        failedTargets: 0,
      });
      expect(
        res.meta.projects.updated.map((p) => p.projectPublicId).sort(),
      ).toEqual(updated.map((p) => p.projectPublicId).sort());
      expect(res.meta.projects.updated.map((p) => p.type).sort()).toEqual(
        updated.map((p) => p.type).sort(),
      );
      expect(res.meta.projects.failed).toStrictEqual([]);

      expect(featureFlagsSpy).toHaveBeenCalledTimes(1);
      expect(listTargetsSpy).toHaveBeenCalledTimes(1);
      expect(listProjectsSpy).toHaveBeenCalledTimes(2);
      expect(githubSpy).toBeCalledTimes(2);
      expect(cloneSpy).toBeCalledTimes(2);
      expect(updateProjectSpy).not.toHaveBeenCalled();
      expect(logUpdatedProjectsSpy).toHaveBeenCalledTimes(2);
    });

    it.todo(
      'Does not disable Dockerfile projects if the entitlement is not enabled',
    );
  });
});

describe('bulkImportTargetFiles', () => {
  let logs: string[];
  const OLD_ENV = process.env;
  process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  const ORG_ID = 'af137b96-6966-46c1-826b-2e79ac49bbxx';
  let importSingleTargetSpy: jest.SpyInstance;

  afterAll(async () => {
    await deleteFiles(logs);
    process.env = { ...OLD_ENV };
  }, 10000);

  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });

  beforeEach(() => {
    importSingleTargetSpy = jest.spyOn(importTarget, 'importSingleTarget');
  });

  afterEach(() => {
    importSingleTargetSpy.mockReset();
  });
  it('succeeds to import a single file', async () => {
    // Arrange
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);
    const target = {
      name: 'ruby-with-versions',
      owner: 'api-import-circle-test',
      branch: 'master',
    };
    const projectId = uuid.v4();
    const projects: Project[] = [
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'Gemfile.lock',
      },
    ];
    importSingleTargetSpy.mockResolvedValue({
      projects,
      failed: [],
    });

    const { created } = await bulkImportTargetFiles(
      requestManager,
      ORG_ID,
      ['ruby-2.5.3-exactly/Gemfile'],
      SupportedIntegrationTypesUpdateProject.GHE,
      target,
    );
    expect(importSingleTargetSpy).toHaveBeenCalledTimes(1);
    expect(created).not.toBe([]);
    expect(created.length).toEqual(1);
    expect(created[0]).toMatchObject({
      dryRun: false,
      from: 'Gemfile.lock',
      projectPublicId: projectId,
      to: `https://app.snyk.io/org/hello/project/${projectId}`,
      type: 'import',
    });
  });
  it('batch imports many files to keep import jobs smaller', async () => {
    // Arrange
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);
    const target = {
      name: 'ruby-with-versions',
      owner: 'api-import-circle-test',
      branch: 'master',
    };
    const projectId = uuid.v4();
    const projects: Project[] = [
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'Gemfile.lock',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'package.json',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'folder/package.json',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'Dockerfile',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'another/Dockerfile',
      },
    ];
    const failedProjects: FailedProject[] = [
      {
        projectUrl: '',
        success: false,
        locationUrl: 'https://polling/url',
        targetFile: 'failure/Dockerfile',
        userMessage: 'Invalid syntax',
      },
    ];

    importSingleTargetSpy.mockResolvedValueOnce({
      projects: [projects[0], projects[1]],
      failed: [],
    });
    importSingleTargetSpy.mockResolvedValueOnce({
      projects: [projects[2], projects[3]],
      failed: [],
    });
    importSingleTargetSpy.mockResolvedValueOnce({
      projects: [projects[4]],
      failed: [failedProjects[0]],
    });

    const { created, failed } = await bulkImportTargetFiles(
      requestManager,
      ORG_ID,
      projects.map((p) => p.targetFile!),
      SupportedIntegrationTypesUpdateProject.GHE,
      target,
      false,
      2,
    );
    expect(importSingleTargetSpy).toHaveBeenCalledTimes(3);
    expect(created).not.toBe([]);
    expect(created.length).toEqual(5);
    expect(failed.length).toEqual(1);

    expect(created.find((c) => c.from === 'folder/package.json')).toMatchObject(
      {
        dryRun: false,
        from: 'folder/package.json',
        projectPublicId: projectId,
        to: `https://app.snyk.io/org/hello/project/${projectId}`,
        type: 'import',
      },
    );
    expect(failed.find((c) => c.from === 'failure/Dockerfile')).toMatchObject({
      dryRun: false,
      from: 'failure/Dockerfile',
      projectPublicId: '',
      to: '',
      type: 'import',
    });
  });
  it('batch imports many files in dryRun mode', async () => {
    // Arrange
    const logFiles = generateLogsPaths(__dirname, ORG_ID);
    logs = Object.values(logFiles);
    const target = {
      name: 'ruby-with-versions',
      owner: 'api-import-circle-test',
      branch: 'master',
    };
    const projectId = uuid.v4();
    const projects: Project[] = [
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'Gemfile.lock',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'package.json',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'folder/package.json',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'Dockerfile',
      },
      {
        projectUrl: `https://app.snyk.io/org/hello/project/${projectId}`,
        success: true,
        targetFile: 'another/Dockerfile',
      },
    ];
    importSingleTargetSpy.mockResolvedValueOnce({
      projects: [projects[0], projects[1]],
      failed: [],
    });
    importSingleTargetSpy.mockResolvedValueOnce({
      projects: [projects[2], projects[3]],
      failed: [],
    });
    importSingleTargetSpy.mockResolvedValueOnce({
      projects: [projects[4]],
      failed: [],
    });

    const { created } = await bulkImportTargetFiles(
      requestManager,
      ORG_ID,
      projects.map((p) => p.targetFile!),
      SupportedIntegrationTypesUpdateProject.GHE,
      target,
      true,
      2,
    );
    expect(importSingleTargetSpy).toHaveBeenCalledTimes(0);
    expect(created).not.toBe([]);
    expect(created.length).toEqual(5);
  });
});
