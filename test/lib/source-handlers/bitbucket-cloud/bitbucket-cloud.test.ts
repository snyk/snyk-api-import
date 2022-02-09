import { listBitbucketCloudWorkspaces } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-workspaces';
import { listBitbucketCloudRepos } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-repos';

describe('Test Bitbucket Cloud script', () => {
  process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
  process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;

  it('listBitbucketCloudWorkspaces script', async () => {
    const workspaces = await listBitbucketCloudWorkspaces();
    expect(workspaces).toBeTruthy();
    expect(workspaces[0]).toHaveProperty('uuid', expect.any(String));
    expect(workspaces[0]).toHaveProperty('slug', expect.any(String));
    expect(workspaces[0]).toHaveProperty('name', expect.any(String));
  }, 60000);
  it('listBitbucketCloudRepos script', async () => {
    const repos = await listBitbucketCloudRepos('snyktestscmgroup');
    expect(repos).toBeTruthy();
    expect(repos[0]).toEqual({
      name: expect.any(String),
      owner: expect.any(String),
      branch: expect.any(String),
    });
  });
  it('listBitbucketCloudRepos script to throw', async () => {
    expect(async () => {
      await listBitbucketCloudRepos('non-existing-project');
    }).rejects.toThrow();
  });
});
