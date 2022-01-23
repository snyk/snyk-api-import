import { listBitbucketServerProjects } from '../../../../src/lib/source-handlers/bitbucket-server/list-projects';

jest.setTimeout(60000);

describe('listBitbucketServerProjects script', () => {
  it('list projects', async () => {
    process.env.BITBUCKET_SERVER_TOKEN = process.env.BBS_TOKEN;
    const sourceUrl = process.env.BBS_SOURCE_URL;
    const projects = await listBitbucketServerProjects(sourceUrl);
    expect(projects).toBeTruthy();
    expect(projects[0]).toHaveProperty('key', expect.any(String));
    expect(projects[0]).toHaveProperty('id', expect.any(Number));
    expect(projects[0]).toHaveProperty('name', expect.any(String));
  });
});
