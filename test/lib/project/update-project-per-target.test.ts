import { requestsManager } from 'snyk-request-manager';
import { updateProjectPerTarget } from '../../../src/scripts/sync/sync-projects-per-target';
import * as github from '../../../src/lib/source-handlers/github';
import * as projects from '../../../src/lib/api/project';

describe('UpdateProject (Github)', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  let githubSpy: jest.SpyInstance;
  let projectsSpy: jest.SpyInstance;

  beforeAll(() => {
    githubSpy = jest.spyOn(github, 'getGithubReposDefaultBranch');
    projectsSpy = jest.spyOn(projects, 'updateProject');
  });

  afterAll(async () => {
    jest.resetAllMocks();
  }, 1000);

  beforeEach(async () => {
    jest.clearAllMocks();
  }, 1000);

  it('updates project when default branch changed', async () => {
    const defaultBranch = 'newBranch';
    githubSpy.mockImplementation(() => Promise.resolve(defaultBranch));
    projectsSpy.mockImplementation(() =>
      Promise.resolve({ ...testProject, branch: defaultBranch }),
    );
    const testProject = {
      name: 'testProject',
      id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
      created: '2018-10-29T09:50:54.014Z',
      origin: 'github',
      type: 'npm',
      branch: 'master',
    };

    const res = await updateProjectPerTarget(
      requestManager,
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
      testProject,
    );
    expect(githubSpy).toHaveBeenCalledTimes(1);
    expect(projectsSpy).toHaveBeenCalledTimes(1);

    expect(res.updated).toBeTruthy();
  }, 5000);

  it('fails to update project, if API call to get default branch fails', async () => {
    const defaultBranch = 'newBranch';
    githubSpy.mockImplementation(() =>
      Promise.reject({ statusCode: 500, message: 'Error' }),
    );
    projectsSpy.mockImplementation(() =>
      Promise.resolve({ ...testProject, branch: defaultBranch }),
    );
    const testProject = {
      name: 'testProject',
      id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
      created: '2018-10-29T09:50:54.014Z',
      origin: 'github',
      type: 'npm',
      branch: 'master',
    };
    expect(
      updateProjectPerTarget(
        requestManager,
        'af137b96-6966-46c1-826b-2e79ac49bbxx',
        testProject,
      ),
    ).rejects.toThrow();
    expect(githubSpy).toHaveBeenCalledTimes(1);
    expect(projectsSpy).not.toHaveBeenCalled();
  }, 5000);

  it('does nothing if the default branch did no change', async () => {
    jest
      .spyOn(github, 'getGithubReposDefaultBranch')
      .mockResolvedValue('master');

    const testProject = {
      name: 'testProject',
      id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
      created: '2018-10-29T09:50:54.014Z',
      origin: 'github',
      type: 'npm',
      branch: 'master',
    };

    const res = await updateProjectPerTarget(
      requestManager,
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
      testProject,
    );
    expect(res.updated).toBeFalsy();
    expect(projectsSpy).not.toHaveBeenCalled();
  }, 5000);
});
