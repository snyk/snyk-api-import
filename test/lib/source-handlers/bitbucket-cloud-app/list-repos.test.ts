import { listRepos } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/list-repos';

describe('listRepos', () => {
  it('throws if token or workspace is invalid', async () => {
    // You can mock needle to return a 401 or error response
    await expect(listRepos('bad-token', 'bad-workspace')).rejects.toThrow();
  });

  // it('returns repos on success', async () => {
  //   // mock needle to return { statusCode: 200, body: { values: [...] } }
  //   // expect(await listRepos('token', 'workspace')).toEqual([...]);
  // });
});
