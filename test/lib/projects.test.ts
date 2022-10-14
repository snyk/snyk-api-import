import { requestsManager } from 'snyk-request-manager';
import { updateProject } from '../../src/lib';
import * as compareProject from '../../src/lib/project/compare-branches';

jest.unmock('snyk-request-manager');
jest.requireActual('snyk-request-manager');

describe('UpdateProject', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    jest.resetAllMocks();
  }, 1000);

  it('Update project branch', async () => {
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

    const res = await updateProject(
      requestManager,
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
      'af137b96-6966-46c1-826b-2e79ac49bbd9',
      { branch: 'newDefaultBranch' },
    );
    expect(res.branch).toMatchSnapshot();
  }, 5000);

  it('Error if the requests fails', async () => {
    jest
      .spyOn(requestManager, 'request')
      .mockResolvedValue({ statusCode: 500, data: {} });
    expect(async () => {
      await updateProject(
        requestManager,
        'af137b96-6966-46c1-826b-2e79ac49bbxx',
        'af137b96-6966-46c1-826b-2e79ac49bbd9',
        { branch: 'newDefaultBranch' },
      );
    }).rejects.toThrowError(
      'Expected a 200 response, instead received: {"data":{},"status":500}',
    );
  }, 5000);
});

describe('compareAndUpdateBranches', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });
  afterAll(async () => {
    jest.resetAllMocks();
  }, 1000);

  it('Update project branch', async () => {
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
      'main',
      'newDefaultBranch',
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
      'af137b96-6966-46c1-826b-2e79ac49bbd9',
    );
    expect(res.projectUpdated).toBeTruthy();
  }, 5000);

  it('Return ProjectNeededUpdate false if branches are the same', async () => {
    const res = await compareProject.compareAndUpdateBranches(
      requestManager,
      'main',
      'main',
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
      'af137b96-6966-46c1-826b-2e79ac49bbd9',
    );
    expect(res.projectUpdated).toBeFalsy();
  }, 5000);

  it('throw if the api requests fails', async () => {
    jest
      .spyOn(requestManager, 'request')
      .mockResolvedValue({ statusCode: 500, data: {} });
    expect(async () => {
      await compareProject.compareAndUpdateBranches(
        requestManager,
        'main',
        'newBranch',
        'af137b96-6966-46c1-826b-2e79ac49bbxx',
        'af137b96-6966-46c1-826b-2e79ac49bbd9',
      );
    }).rejects.toThrowError(
      'Expected a 200 response, instead received: {"data":{},"status":500}',
    );
  }, 5000);
});
