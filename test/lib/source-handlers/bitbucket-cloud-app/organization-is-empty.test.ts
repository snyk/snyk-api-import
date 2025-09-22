import { organizationIsEmpty } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/organization-is-empty';

describe('organizationIsEmpty', () => {
  it('throws if token or workspace is invalid', async () => {
    // You can mock needle to return a 401 or error response
    await expect(organizationIsEmpty('bad-token', 'bad-workspace')).rejects.toThrow();
  });

  // it('returns true/false on success', async () => {
  //   // mock needle to return { statusCode: 200, body: { values: [] } }
  //   // expect(await organizationIsEmpty('token', 'workspace')).toBe(true);
  // });
});
