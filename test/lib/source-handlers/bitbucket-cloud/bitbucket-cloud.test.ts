import { listBitbucketCloudWorkspaces } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-workspaces';

jest.setTimeout(60000);

describe('Test Bitbucket Cloud script', () => {
  process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
  process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;

  it('listBitbucketCloudWorkspaces script', async () => {
    const workspaces = await listBitbucketCloudWorkspaces();
    expect(workspaces).toBeTruthy();
    expect(workspaces[0]).toHaveProperty('uuid', expect.any(String));
    expect(workspaces[0]).toHaveProperty('slug', expect.any(String));
    expect(workspaces[0]).toHaveProperty('name', expect.any(String));
  });
});
