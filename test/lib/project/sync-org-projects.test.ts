import { requestsManager } from 'snyk-request-manager';
import * as listProjects from '../../../src/lib';
import { updateTargets } from '../../../src/scripts/sync/sync-org-projects';

describe('updateTargets', () => {
  const requestManager = new requestsManager({
    userAgentPrefix: 'snyk-api-import:tests',
  });

  afterAll(async () => {
    jest.resetAllMocks();
  }, 1000);

  it.only('update project branch for a github repo', async () => {
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

    const testProjects = [
      {
        name: 'testProject',
        id: 'af137b96-6966-46c1-826b-2e79ac49bbxx',
        created: '2018-10-29T09:50:54.014Z',
        origin: 'github',
        type: 'npm',
        branch: 'master',
      },
    ];

    const orgId = 'af137b96-6966-46c1-826b-2e79ac49bbxx';

    jest.spyOn(listProjects, 'listProjects').mockResolvedValue(testProjects);

    const res = await updateTargets(requestManager, orgId, testTarget);

    expect(res.processedTargets).toEqual(1);
    expect(res.meta.projects.branchUpdated).toEqual(
      'af137b96-6966-46c1-826b-2e79ac49bbxx',
    );
  }, 5000);
});
