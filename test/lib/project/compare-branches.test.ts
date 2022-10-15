import { requestsManager } from 'snyk-request-manager';
import * as compareProject from '../../../src/lib/project/compare-branches';

describe('compareAndUpdateBranches', () => {
  const OLD_ENV = process.env;
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  beforeAll(() => {
    process.env.SNYK_API = process.env.SNYK_API_TEST;
    process.env.SNYK_TOKEN = process.env.SNYK_TOKEN_TEST;
  });
  afterAll(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
  }, 1000);
  afterEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
  }, 1000);
  it('updates project branch if the default branch changed', async () => {
    jest.spyOn(requestManager, 'request').mockResolvedValue({
      data: {
        name: 'test',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbd9',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'maven',
        readOnly: false,
        testFrequency: 'daily',
        totalDependencies: 42,
        issueCountsBySeverity: {},
        imageId: 'sha256:caf27325b298a6730837023a8a342699c8b7b388b8d',
        imageTag: 'latest',
        imageBaseImage: 'alpine:3',
        imagePlatform: 'linux/arm64',
        imageCluster: 'Production',
        hostname: null,
        remoteRepoUrl: 'https://github.com/snyk/test.git',
        lastTestedDate: '2019-02-05T08:54:07.704Z',
        browseUrl:
          'https://app.snyk.io/org/4a18d42f-0706-4ad0-b127-24078731fbed/project/af137b96-6966-46c1-826b-2e79ac49bbd9',
        importingUser: {},
        isMonitored: false,
        branch: 'newDefaultBranch',
        targetReference: null,
        tags: [],
        attributes: {},
        remediation: {},
      },
      status: 200,
    });

    const res = await compareProject.compareAndUpdateBranches(
      requestManager,
      {
        branch: 'main',
        projectPublicId: 'af137b96-6966-46c1-826b-2e79ac49bbd9',
      },
      'newDefaultBranch',
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
    );
    expect(res.updated).toBeTruthy();
  }, 5000);

  it('does not call the Projects API in dryRun mode', async () => {
    const requestSpy = jest.spyOn(requestManager, 'request').mockResolvedValue({
      data: {},
      status: 200,
    });

    const res = await compareProject.compareAndUpdateBranches(
      requestManager,
      {
        branch: 'main',
        projectPublicId: 'af137b96-6966-46c1-826b-2e79ac49bbd9',
      },
      'newDefaultBranch',
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
      true,
    );
    expect(requestSpy).not.toHaveBeenCalled();
    expect(res.updated).toBeTruthy();
  }, 5000);

  it('does not update the project if the branches are the same', async () => {
    const res = await compareProject.compareAndUpdateBranches(
      requestManager,
      {
        branch: 'main',
        projectPublicId: 'af137b96-6966-46c1-826b-2e79ac49bbd9',
      },
      'main',
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
    );
    expect(res.updated).toBeFalsy();
  }, 5000);

  it('throws if the api requests fails', async () => {
    jest
      .spyOn(requestManager, 'request')
      .mockResolvedValue({ statusCode: 500, data: {} });
    expect(async () => {
      await compareProject.compareAndUpdateBranches(
        requestManager,
        {
          branch: 'main',
          projectPublicId: 'af137b96-6966-46c1-826b-2e79ac49bbd9',
        },
        'newBranch',
        'af137b96-6966-46c1-826b-2e79ac49bbxx',
      );
    }).rejects.toThrowError(
      'Expected a 200 response, instead received: {"data":{},"status":500}',
    );
  }, 5000);
});
