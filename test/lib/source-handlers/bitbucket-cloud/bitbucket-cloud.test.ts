import { listBitbucketCloudWorkspaces } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-workspaces';
import { listBitbucketCloudRepos } from '../../../../src/lib/source-handlers/bitbucket-cloud/list-repos';
import { getBitbucketCloudAuth } from '../../../../src/lib/source-handlers/bitbucket-cloud/get-bitbucket-cloud-auth';
import * as nock from 'nock';

describe('Test Bitbucket Cloud script', () => {
  // Set up environment variables for test if needed. If username/password
  // are not provided we fall back to an API token for the bearer flow so
  // the test continues to work after supporting token-based listing.
  if (!process.env.BITBUCKET_CLOUD_USERNAME && process.env.BBC_USERNAME) {
    process.env.BITBUCKET_CLOUD_USERNAME = process.env.BBC_USERNAME;
  }
  if (!process.env.BITBUCKET_CLOUD_PASSWORD && process.env.BBC_PASSWORD) {
    process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BBC_PASSWORD;
  }
  if (!process.env.BITBUCKET_CLOUD_USERNAME && !process.env.BITBUCKET_CLOUD_API_TOKEN) {
    // Provide a dummy API token for the bearer-based test path
    process.env.BITBUCKET_CLOUD_API_TOKEN = 'test-apitoken';
  }

  // Intercept the Bitbucket workspaces API and return a minimal valid
  // payload so the listBitbucketCloudWorkspaces() call succeeds for both
  // Basic and Bearer auth.
  const workspacesScope = nock('https://api.bitbucket.org')
    .get('/2.0/workspaces')
    .query(true)
    .reply(200, {
      values: [
        { slug: 'snyktest', uuid: '{1111-2222}', name: 'snyktest' },
      ],
    });
  const reposScope = nock('https://api.bitbucket.org')
    .get('/2.0/repositories/snyktestscmgroup')
    .query(true)
    .reply(200, {
      values: [
        {
          slug: 'repo1',
          name: 'repo1',
          workspace: { slug: 'snyktestscmgroup' },
          mainbranch: { name: 'main' },
        },
      ],
    });
  const reposNotFoundScope = nock('https://api.bitbucket.org')
    .get('/2.0/repositories/non-existing-project')
    .query(true)
    .reply(404, {});

  it('listBitbucketCloudWorkspaces script', async () => {
  const workspaces = await listBitbucketCloudWorkspaces();
    expect(workspaces).toBeTruthy();
    expect(workspaces[0]).toHaveProperty('uuid', expect.any(String));
    expect(workspaces[0]).toHaveProperty('slug', expect.any(String));
    expect(workspaces[0]).toHaveProperty('name', expect.any(String));
    // ensure our mocked endpoint was called
    expect(workspacesScope.isDone()).toBe(true);
  }, 60000);
  it('listBitbucketCloudRepos script', async () => {
  const auth = getBitbucketCloudAuth('user') as { type: 'user'; username: string; appPassword?: string; password?: string };
    const config = {
      type: "user" as const,
      username: auth.username,
      password: (auth.appPassword || auth.password || '') as string,
    };
    const repos = await listBitbucketCloudRepos(config, 'snyktestscmgroup');
    expect(repos).toBeTruthy();
    expect(repos[0]).toEqual({
      name: expect.any(String),
      owner: expect.any(String),
      branch: expect.any(String),
    });
    expect(reposScope.isDone()).toBe(true);
  });
  it('listBitbucketCloudRepos script to throw', async () => {
  const auth = getBitbucketCloudAuth('user') as { type: 'user'; username: string; appPassword?: string; password?: string };
    const config = {
      type: "user" as const,
      username: auth.username,
      password: (auth.appPassword || auth.password || '') as string,
    };
    await expect(listBitbucketCloudRepos(config, 'non-existing-project')).rejects.toThrow();
    expect(reposNotFoundScope.isDone()).toBe(true);
  });
});
