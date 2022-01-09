import { listBitbucketServerProjects } from '../../../../src/lib/source-handlers/bitbucket-server/list-projects';
import { listBitbucketServerRepos } from '../../../../src/lib/source-handlers/bitbucket-server/list-repos';

jest.setTimeout(60000);

describe('listBitbucketServerProjects script', () => {
  process.env.BITBUCKET_SERVER_TOKEN = process.env.BBS_TOKEN;
  const sourceUrl = process.env.BBS_SOURCE_URL!.toString();
  const bitbucketServerTestOrgName = process.env.BBS_TEST_ORG_NAME!.toString();

  it('listBitbucketServerProjects script', async () => {
    const projects = await listBitbucketServerProjects(sourceUrl);
    expect(projects).toBeTruthy();
    expect(projects[0]).toHaveProperty('key', expect.any(String));
    expect(projects[0]).toHaveProperty('id', expect.any(Number));
    expect(projects[0]).toHaveProperty('name', expect.any(String));
  });
  it('listBitbucketServerRepos script', async () => {
    const repos = await listBitbucketServerRepos(
      bitbucketServerTestOrgName,
      sourceUrl,
    );
    expect(repos).toBeTruthy();
    expect(repos[0]).toHaveProperty('repoSlug', expect.any(String));
    expect(repos[0]).toHaveProperty('projectKey', expect.any(String));
  });
});
