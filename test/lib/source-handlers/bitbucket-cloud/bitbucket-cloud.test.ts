import { listBitbucketCloudWorkspaces } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-workspaces';
import { listBitbucketCloudRepos } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-repos';
import { getBitbucketCloudAuth } from '../../../../src/lib/source-handlers/bitbucket-cloud/get-bitbucket-cloud-auth';

describe('Test Bitbucket Cloud script', () => {
  // Set up environment variables for test if needed
  if (!process.env.BITBUCKET_CLOUD_USERNAME && process.env.BBC_USERNAME) {
    process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
  }
  if (!process.env.BITBUCKET_CLOUD_PASSWORD && process.env.BBC_PASSWORD) {
    process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;
  }

  it('listBitbucketCloudWorkspaces script', async () => {
  const workspaces = await listBitbucketCloudWorkspaces();
    expect(workspaces).toBeTruthy();
    expect(workspaces[0]).toHaveProperty('uuid', expect.any(String));
    expect(workspaces[0]).toHaveProperty('slug', expect.any(String));
    expect(workspaces[0]).toHaveProperty('name', expect.any(String));
  }, 60000);
  it('listBitbucketCloudRepos script', async () => {
    const { username, password } = getBitbucketCloudAuth();
    const config = {
      type: "user" as const,
      username,
      password,
    };
    const repos = await listBitbucketCloudRepos(config, 'snyktestscmgroup');
    expect(repos).toBeTruthy();
    expect(repos[0]).toEqual({
      name: expect.any(String),
      owner: expect.any(String),
      branch: expect.any(String),
    });
  });
  it('listBitbucketCloudRepos script to throw', async () => {
    const { username, password } = getBitbucketCloudAuth();
    const config = {
      type: "user" as const,
      username,
      password,
    };
    await expect(listBitbucketCloudRepos(config, 'non-existing-project')).rejects.toThrow();
  });
});
