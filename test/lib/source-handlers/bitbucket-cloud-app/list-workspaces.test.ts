import {
  listBitbucketCloudAppWorkspaces,
  bitbucketCloudAppWorkspaceIsEmpty,
} from '../../../../src/lib/source-handlers/bitbucket-cloud-app/list-workspaces';

jest.mock('needle');
const needle = require('needle') as jest.MockedFunction<any>;

describe('bitbucket cloud app workspaces', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetAllMocks();
  });

  it('returns list of workspaces', async () => {
    process.env.BITBUCKET_APP_CLIENT_ID = 'id';
    process.env.BITBUCKET_APP_CLIENT_SECRET = 'secret';

    // first call: token exchange
    needle.mockResolvedValueOnce({
      body: { access_token: 'tok', expires_in: 3600 },
    });
    // second call: list workspaces
    needle.mockResolvedValueOnce({
      body: { values: [{ uuid: 'u1', name: 'n1', slug: 's1' }] },
    });

    const ws = await listBitbucketCloudAppWorkspaces();
    expect(ws).toEqual([{ uuid: 'u1', name: 'n1', slug: 's1' }]);
  });

  it('workspaceIsEmpty returns true when no repos', async () => {
    process.env.BITBUCKET_APP_CLIENT_ID = 'id';
    process.env.BITBUCKET_APP_CLIENT_SECRET = 'secret';

    needle.mockResolvedValueOnce({
      body: { access_token: 'tok', expires_in: 3600 },
    });
    needle.mockResolvedValueOnce({ body: { size: 0 } });

    const res = await bitbucketCloudAppWorkspaceIsEmpty('myws');
    expect(res).toBe(true);
  });
});
