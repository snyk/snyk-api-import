import { getBitbucketAppToken } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/get-bitbucket-app-token';

describe('getBitbucketAppToken', () => {
  it('throws if clientId or clientSecret is missing', async () => {
    await expect(getBitbucketAppToken({ clientId: '', clientSecret: '' })).rejects.toThrow();
  });

  // You can mock needle for a successful response
  // Example:
  // it('returns token on success', async () => {
  //   // mock needle to return { statusCode: 200, body: { access_token: 'token' } }
  //   // expect(await getBitbucketAppToken({ clientId: 'id', clientSecret: 'secret' })).toBe('token');
  // });
});
