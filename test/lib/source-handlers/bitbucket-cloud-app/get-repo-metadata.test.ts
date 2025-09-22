import { getRepoMetadata } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/get-repo-metadata';

describe('getRepoMetadata', () => {
  it('throws if token, workspace, or repoSlug is invalid', async () => {
    // You can mock needle to return a 404 or error response
    await expect(getRepoMetadata('bad-token', 'bad-workspace', 'bad-repo')).rejects.toThrow();
  });

  // it('returns repo metadata on success', async () => {
  //   // mock needle to return { statusCode: 200, body: { ... } }
  //   // expect(await getRepoMetadata('token', 'workspace', 'repo')).toEqual({ ... });
  // });
});
