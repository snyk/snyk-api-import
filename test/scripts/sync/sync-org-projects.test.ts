import { requestsManager } from 'snyk-request-manager';
import * as uuid from 'uuid';
import { updateOrgTargets, updateTargets } from '../../../src/scripts/sync/sync-org-projects';
import type { ProjectsResponse } from '../../../src/lib/api/org';
import * as updateProjectForTarget from '../../../src/scripts/sync/sync-projects-per-target';
import type { SnykProject, SnykTarget, SnykTargetRelationships } from '../../../src/lib/types';
import { SupportedIntegrationTypesUpdateProject } from '../../../src/lib/types';
import * as lib from '../../../src/lib';
import * as projectApi from '../../../src/lib/api/project';
import * as github from '../../../src/lib/source-handlers/github';
import * as featureFlags from '../../../src/lib/api/feature-flags';
import * as updateProjectsLog from '../../../src/loggers/log-updated-project';

describe('updateTargets', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Github', () => {

    it('updates a projects branch if default branch changed', async () => {
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

      const testProjects: ProjectsResponse = {
        org: {
          id: "af137b96-6966-46c1-826b-2e79ac49bbxx",
        },
        projects: [{
          name: 'testProject',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        }]
      }

      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';

      jest.spyOn(lib, 'listProjects').mockImplementation(() => Promise.resolve(testProjects));
      jest.spyOn(updateProjectForTarget, 'updateProjectForTarget').mockImplementation(() => Promise.resolve({ updated: true }));

      const res = await updateTargets(requestManager, orgId, testTarget);

      expect(res.processedTargets).toEqual(1);
      expect(res.meta.projects.branchUpdated).toEqual(
        ['af137b96-6966-46c1-826b-2e79ac49bbxx',]
      );
    }, 5000);

    it('did not need to update a projects branch', async () => {
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

      const testProjects: ProjectsResponse = {
        org: {
          id: "af137b96-6966-46c1-826b-2e79ac49bbxx",
        },
        projects: [{
          name: 'testProject',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        }]
      }

      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';

      jest.spyOn(lib, 'listProjects').mockImplementation(() => Promise.resolve(testProjects));
      jest.spyOn(updateProjectForTarget, 'updateProjectForTarget').mockImplementation(() => Promise.resolve({ updated: false }));

      const res = await updateTargets(requestManager, orgId, testTarget);

      expect(res.processedTargets).toEqual(1);
      expect(res.meta.projects.branchUpdated).toEqual(
        []
      );
    }, 5000);

    it('updates several projects from the same target 1 failed 1 success', async () => {
      const testTargets = [
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

      const testProjects: ProjectsResponse = {
        org: {
          id: "af137b96-6966-46c1-826b-2e79ac49bbxx",
        },
        projects: [{
          name: 'testProject',
          id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'npm',
          branch: 'master',
        }, {
          name: 'testProject2',
          id: 'af137b96-6966-46c1-826b-2e79ac49aaxx',
          created: '2018-10-29T09:50:54.014Z',
          origin: 'github',
          type: 'maven',
          branch: 'master',
        }]
      }

      const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';

      jest.spyOn(lib, 'listProjects').mockImplementationOnce(() => Promise.resolve(testProjects))
      jest.spyOn(updateProjectForTarget, 'updateProjectForTarget').mockImplementationOnce(() => Promise.resolve({ updated: true })).mockImplementationOnce(() => Promise.resolve({ updated: false }));

      const res = await updateTargets(requestManager, orgId, testTargets);

      expect(res.processedTargets).toEqual(1);
      expect(res.meta.projects.branchUpdated).toEqual(
        ['af137b96-6966-46c1-826b-2e79ac49bbxx',]
      );
    }, 5000);
  });
});
describe('updateOrgTargets', () => {
  const OLD_ENV = process.env;
  process.env.SNYK_LOG_PATH = './';
  process.env.SNYK_TOKEN = 'dummy'

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
    githubSpy = jest.spyOn(github, 'getGithubReposDefaultBranch');
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

  describe('Github', () => {
    it('skip unsupported origins', async () => {
      const res = await updateOrgTargets('xxx', ['unsupported' as any]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [],
          },
        },
        "processedTargets": 0
      })
    });
    it('skip an org that uses the customBranch FF', async () => {
      featureFlagsSpy.mockResolvedValue(true);
      logUpdatedProjectsSpy.mockResolvedValue(null);
      const res = await updateOrgTargets('xxx', ['unsupported' as any]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [],
          },
        },
        "processedTargets": 0
      })
    });

    it('throws error if listTargets has API error', async () => {
      featureFlagsSpy.mockResolvedValue(false)
      listTargetsSpy.mockRejectedValue('Expected a 200 response, instead received:' + JSON.stringify({ statusCode: 500, message: 'Something went wrong' }))
      expect(updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB])).rejects.toThrowError('Expected a 200 response, instead received');
    });
    it('skips target if listingProjects has API error', async () => {
      const targets: SnykTarget[] = [{
        attributes: {
          displayName: 'foo/bar',
          isPrivate: true,
          origin: 'github',
          remoteUrl: null,
        },
        id: 'xxx',
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }]
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue('Expected a 200 response, instead received:' + JSON.stringify({ statusCode: 500, message: 'Something went wrong' }));
      logUpdatedProjectsSpy.mockResolvedValue(null);

      const res = await updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [],
          },
        },
        "processedTargets": 0,
      });
    });
    it('skips target & projects error if getting default branch fails', async () => {
      const targets: SnykTarget[] = [{
        attributes: {
          displayName: 'foo/bar',
          isPrivate: true,
          origin: 'github',
          remoteUrl: null,
        },
        id: 'xxx',
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }];
      const projects: SnykProject[] = [{
        name: 'example',
        id: '123',
        created: 'date',
        origin: 'github',
        type: 'npm',
        branch: 'main'
      }];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockRejectedValue(projects);
      logUpdatedProjectsSpy.mockResolvedValue(null);

      const res = await updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [],
          },
        },
        "processedTargets": 0,
      });
    });

    // TODO: needs more work, updateProject spy is calling real function still.
    it('Successfully updated several targets (1 supported, 1 unsupported)', async () => {
      const targets: SnykTarget[] = [{
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
          displayName: 'snyk/cli',
          isPrivate: true,
          origin: 'github-enterprise',
          remoteUrl: null,
        },
        id: uuid.v4(),
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }];
      const updatedProjectId = uuid.v4();
      const projects: SnykProject[] = [{
        name: 'example',
        id: updatedProjectId,
        created: 'date',
        origin: 'github',
        type: 'npm',
        branch: 'main'
      }];
      featureFlagsSpy.mockResolvedValue(false);
      listTargetsSpy.mockResolvedValue({ targets });
      listProjectsSpy.mockResolvedValueOnce({ projects });
      listProjectsSpy.mockResolvedValue({ projects: [] });
      logUpdatedProjectsSpy.mockResolvedValue(null);
      githubSpy.mockResolvedValue('develop');
      updateProjectSpy.mockResolvedValue('');

      const res = await updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [updatedProjectId],
          },
        },
        "processedTargets": 2,
      });
    });
    it('Some projects fail to update in a target', async () => {
      const targets: SnykTarget[] = [{
        attributes: {
          displayName: 'snyk/bar',
          isPrivate: true,
          origin: 'github',
          remoteUrl: null,
        },
        id: uuid.v4(),
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }];
      const updatedProjectId = uuid.v4();
      const projects: SnykProject[] = [{
        name: 'snyk/bar',
        id: updatedProjectId,
        created: 'date',
        origin: 'github',
        type: 'npm',
        branch: 'main'
      },
      {
        name: 'snyk/foo',
        id: uuid.v4(),
        created: 'date',
        origin: 'github',
        type: 'yarn',
        branch: 'develop'
      }];
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy.mockResolvedValueOnce({ projects });
      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      githubSpy.mockResolvedValueOnce('develop');
      githubSpy.mockRejectedValueOnce('Failed to get default branch from Github');
      updateProjectSpy.mockResolvedValue('');

      const res = await updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [updatedProjectId],
          },
        },
        "processedTargets": 1,
      });
    });
    it('Successfully updated several targets', async () => {
      const targets: SnykTarget[] = [{
        attributes: {
          displayName: 'snyk/bar',
          isPrivate: true,
          origin: 'github',
          remoteUrl: null,
        },
        id: uuid.v4(),
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }, {
        attributes: {
          displayName: 'snyk/foo',
          isPrivate: false,
          origin: 'github',
          remoteUrl: null,
        },
        id: uuid.v4(),
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }];
      const updatedProjectId1 = uuid.v4();
      const updatedProjectId2 = uuid.v4();
      const projectsTarget1: SnykProject[] = [{
        name: 'snyk/bar',
        id: updatedProjectId1,
        created: 'date',
        origin: 'github',
        type: 'npm',
        branch: 'main'
      }];
      const projectsTarget2: SnykProject[] = [
        {
          name: 'snyk/foo',
          id: updatedProjectId2,
          created: 'date',
          origin: 'github',
          type: 'yarn',
          branch: 'develop'
        }];
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy.mockResolvedValueOnce({ projects: projectsTarget1 });
      listProjectsSpy.mockResolvedValueOnce({ projects: projectsTarget2 });

      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      githubSpy.mockResolvedValue('new-branch');
      updateProjectSpy.mockResolvedValue('');

      const res = await updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB]);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [updatedProjectId1, updatedProjectId2],
          },
        },
        "processedTargets": 2,
      });
    });
    it('Successfully updated several targets (dryRun mode)', async () => {
      const targets: SnykTarget[] = [{
        attributes: {
          displayName: 'snyk/bar',
          isPrivate: true,
          origin: 'github',
          remoteUrl: null,
        },
        id: uuid.v4(),
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }, {
        attributes: {
          displayName: 'snyk/foo',
          isPrivate: false,
          origin: 'github',
          remoteUrl: null,
        },
        id: uuid.v4(),
        relationships: {} as unknown as SnykTargetRelationships,
        type: 'target',
      }];
      const updatedProjectId1 = uuid.v4();
      const updatedProjectId2 = uuid.v4();
      const projectsTarget1: SnykProject[] = [{
        name: 'snyk/bar',
        id: updatedProjectId1,
        created: 'date',
        origin: 'github',
        type: 'npm',
        branch: 'main'
      }];
      const projectsTarget2: SnykProject[] = [
        {
          name: 'snyk/foo',
          id: updatedProjectId2,
          created: 'date',
          origin: 'github',
          type: 'yarn',
          branch: 'develop'
        }];
      featureFlagsSpy.mockResolvedValueOnce(false);
      listTargetsSpy.mockResolvedValueOnce({ targets });
      listProjectsSpy.mockResolvedValueOnce({ projects: projectsTarget1 });
      listProjectsSpy.mockResolvedValueOnce({ projects: projectsTarget2 });

      logUpdatedProjectsSpy.mockResolvedValueOnce(null);
      githubSpy.mockResolvedValue('new-branch');

      const res = await updateOrgTargets('xxx', [SupportedIntegrationTypesUpdateProject.GITHUB], true);
      expect(res).toEqual({
        "fileName": expect.stringMatching("/updated-projects.log"),
        "meta": {
          "projects": {
            "branchUpdated": [updatedProjectId1, updatedProjectId2],
          },
        },
        "processedTargets": 2,
      });
      expect(updateProjectSpy).not.toHaveBeenCalled();
    });
  });
});
