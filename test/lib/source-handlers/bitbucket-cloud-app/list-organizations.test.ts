import { listOrganizations } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/list-organizations';

describe('listOrganizations', () => {
  it('throws if token is invalid', async () => {
    // You can mock needle to return a 401 or error response
    await expect(listOrganizations('bad-token')).rejects.toThrow();
  });

  // it('returns orgs on success', async () => {
  //   // mock needle to return { statusCode: 200, body: { values: [...] } }
  //   // expect(await listOrganizations('token')).toEqual([...]);
  // });
});
