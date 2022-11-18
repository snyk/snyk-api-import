import { requestsManager } from 'snyk-request-manager';
import * as uuid from 'uuid';
import {
  updateOrgTargets,
  updateTargets,
} from '../../../src/scripts/sync/sync-org-projects';
import type { ProjectsResponse } from '../../../src/lib/api/org';
import type * as syncProjectsForTarget from '../../../src/scripts/sync/sync-projects-per-target';
import type {
  SnykProject,
  SnykTarget,
  SnykTargetRelationships,
} from '../../../src/lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../../src/lib/types';
import * as lib from '../../../src/lib';
import * as projectApi from '../../../src/lib/api/project';
import * as github from '../../../src/lib/source-handlers/github';
import * as featureFlags from '../../../src/lib/api/feature-flags';
import * as updateProjectsLog from '../../../src/loggers/log-updated-project';

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

  beforeAll(() => {
    githubSpy = jest.spyOn(github, 'getGithubRepoMetaData');
    updateProjectsSpy = jest.spyOn(projectApi, 'updateProject');
    listProjectsSpy = jest.spyOn(lib, 'listProjects');
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
          type: 'branch',
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
        }),
      );
      updateProjectsSpy.mockImplementation(() =>
        Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
      );
      // Act
      const res = await updateTargets(requestManager, orgId, testTarget);

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
        }),
      );
      updateProjectsSpy.mockImplementation(() =>
        Promise.resolve({ ...projectsAPIResponse, branch: defaultBranch }),
      );

      // Act
      const res = await updateTargets(requestManager, orgId, testTarget);

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
          },
          {
            name: 'snyk/monorepo(main):package.json',
            id: 'f57afea5-8fed-41d8-a8fd-d374c0944b07',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github',
            type: 'maven',
            branch: 'master',
          },
        ],
      };

      const defaultBranch = 'develop';
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: projectsAPIResponse.projects[0].id,
          from: projectsAPIResponse.projects[0].branch!,
          to: defaultBranch,
          type: 'branch',
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
          type: 'branch',
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
      const res = await updateTargets(requestManager, orgId, testTargets);

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
          },
          {
            name: 'snyk/monorepo(main):package.json',
            id: 'f57afea5-8fed-41d8-a8fd-d374c0944b07',
            created: '2018-10-29T09:50:54.014Z',
            origin: 'github-enterprise',
            type: 'maven',
            branch: 'master',
          },
        ],
      };

      const defaultBranch = 'develop';
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: projectsAPIResponse.projects[0].id,
          from: projectsAPIResponse.projects[0].branch!,
          to: defaultBranch,
          type: 'branch',
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
          type: 'branch',
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
        false,
        'https://custom-ghe.com',
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

  beforeAll(() => {
    featureFlagsSpy = jest.spyOn(featureFlags, 'getFeatureFlag');
    listTargetsSpy = jest.spyOn(lib, 'listTargets');
    listProjectsSpy = jest.spyOn(lib, 'listProjects');
    logUpdatedProjectsSpy = jest.spyOn(updateProjectsLog, 'logUpdatedProjects');
    githubSpy = jest.spyOn(github, 'getGithubRepoMetaData');
    updateProjectSpy = jest.spyOn(projectApi, 'updateProject');
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
        updateOrgTargets('xxx', ['unsupported' as any]),
      ).rejects.toThrowError(
        'Nothing to sync, stopping. Sync command currently only supports the following sources: github',
      );
    });
    it('throws if the organization uses the customBranch FF', async () => {
      featureFlagsSpy.mockResolvedValue(true);
      await expect(
        updateOrgTargets('xxx', [
          SupportedIntegrationTypesUpdateProject.GITHUB,
        ]),
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
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(
        'Expected a 200 response, instead received:' +
          JSON.stringify({ statusCode: 500, message: 'Something went wrong' }),
      );
      logUpdatedProjectsSpy.mockResolvedValue(null);

      const res = await updateOrgTargets('xxx', [
        SupportedIntegrationTypesUpdateProject.GITHUB,
      ]);
      expect(res).toStrictEqual({
        failedFileName: expect.stringMatching('failed-to-update-projects.log'),
        fileName: expect.stringMatching('/updated-projects.log'),
        meta: {
          projects: {
            failed: [],
            updated: [],
          },
        },
        processedTargets: 0,
        failedTargets: 1,
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
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      // Act
      await expect(() =>
        updateOrgTargets('xxx', [
          SupportedIntegrationTypesUpdateProject.GITHUB,
        ]),
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
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      // Act
      const res = await updateOrgTargets('xxx', [
        SupportedIntegrationTypesUpdateProject.GITHUB,
      ]);

      expect(res).toStrictEqual({
        failedFileName: expect.stringMatching('/failed-to-update-projects.log'),
        fileName: expect.stringMatching('/updated-projects.log'),
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
      const projectsTarget1: SnykProject[] = [
        {
          name: 'snyk/bar',
          id: updatedProjectId1,
          created: 'date',
          origin: 'github',
          type: 'npm',
          branch: 'main',
        },
      ];
      const projectsTarget2: SnykProject[] = [
        {
          name: 'snyk/foo',
          id: updatedProjectId2,
          created: 'date',
          origin: 'github',
          type: 'yarn',
          branch: 'develop',
        },
      ];
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy
        .mockResolvedValueOnce({ projects: projectsTarget1 })
        .mockResolvedValueOnce({ projects: projectsTarget2 });

      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      const defaultBranch = 'new-branch';
      githubSpy.mockResolvedValue({
        branch: defaultBranch,
        cloneUrl: 'https://some-url.com',
      });
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: updatedProjectId1,
          from: projectsTarget1[0].branch!,
          to: defaultBranch,
          type: 'branch',
          dryRun: true,
          target: targets[0],
        },
        {
          projectPublicId: updatedProjectId2,
          from: projectsTarget2[0].branch!,
          to: defaultBranch,
          type: 'branch',
          dryRun: true,
          target: targets[1],
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [];

      // Act
      const res = await updateOrgTargets(
        'xxx',
        [SupportedIntegrationTypesUpdateProject.GITHUB],
        true,
      );
      // Assert
      expect(res).toStrictEqual({
        failedFileName: expect.stringMatching('/failed-to-update-projects.log'),
        fileName: expect.stringMatching('/updated-projects.log'),
        meta: {
          projects: {
            updated,
            failed,
          },
        },
        processedTargets: 2,
        failedTargets: 0,
      });
      expect(featureFlagsSpy).toHaveBeenCalledTimes(1);
      expect(listTargetsSpy).toHaveBeenCalledTimes(1);
      expect(listProjectsSpy).toHaveBeenCalledTimes(2);
      expect(githubSpy).toBeCalledTimes(2);
      expect(updateProjectSpy).not.toHaveBeenCalled();
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
        },
      ];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      // Act & Assert
      await expect(() =>
        updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GHE]),
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
      const projectsTarget1: SnykProject[] = [
        {
          name: 'snyk/bar',
          id: updatedProjectId1,
          created: 'date',
          origin: 'github',
          type: 'npm',
          branch: 'main',
        },
      ];
      const projectsTarget2: SnykProject[] = [
        {
          name: 'snyk/foo',
          id: updatedProjectId2,
          created: 'date',
          origin: 'github-enterprise',
          type: 'yarn',
          branch: 'develop',
        },
      ];
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy
        .mockResolvedValueOnce({ projects: projectsTarget1 })
        .mockResolvedValueOnce({ projects: projectsTarget2 });

      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      const defaultBranch = 'new-branch';
      githubSpy.mockResolvedValue({
        branch: defaultBranch,
        cloneUrl: 'https://some-url.com',
      });
      const updated: syncProjectsForTarget.ProjectUpdate[] = [
        {
          projectPublicId: updatedProjectId1,
          from: projectsTarget1[0].branch!,
          to: defaultBranch,
          type: 'branch',
          dryRun: true,
          target: targets[0],
        },
        {
          projectPublicId: updatedProjectId2,
          from: projectsTarget2[0].branch!,
          to: defaultBranch,
          type: 'branch',
          dryRun: true,
          target: targets[1],
        },
      ];
      const failed: syncProjectsForTarget.ProjectUpdateFailure[] = [];

      // Act
      const res = await updateOrgTargets(
        'xxx',
        [SupportedIntegrationTypesUpdateProject.GHE],
        true,
        'https://custom.ghe.com',
      );
      // Assert
      expect(res).toStrictEqual({
        failedFileName: expect.stringMatching('/failed-to-update-projects.log'),
        fileName: expect.stringMatching('/updated-projects.log'),
        meta: {
          projects: {
            updated,
            failed,
          },
        },
        processedTargets: 2,
        failedTargets: 0,
      });
      expect(featureFlagsSpy).toHaveBeenCalledTimes(1);
      expect(listTargetsSpy).toHaveBeenCalledTimes(1);
      expect(listProjectsSpy).toHaveBeenCalledTimes(2);
      expect(githubSpy).toBeCalledTimes(2);
      expect(updateProjectSpy).not.toHaveBeenCalled();
      expect(logUpdatedProjectsSpy).toHaveBeenCalledTimes(2);
    });
  });
});
