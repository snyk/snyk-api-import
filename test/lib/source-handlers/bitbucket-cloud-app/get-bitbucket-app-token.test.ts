import {
  getBitbucketAppToken,
  clearBitbucketAppTokenCache,
} from '../../../../src/lib/source-handlers/bitbucket-cloud-app/get-bitbucket-app-token';

jest.mock('needle');
const needle = require('needle') as jest.MockedFunction<any>;

describe('getBitbucketAppToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    clearBitbucketAppTokenCache();
    process.env = { ...originalEnv };
    jest.resetAllMocks();
  });

  it('throws when env vars are missing', async () => {
    delete process.env.BITBUCKET_APP_CLIENT_ID;
    delete process.env.BITBUCKET_APP_CLIENT_SECRET;

    await expect(getBitbucketAppToken()).rejects.toThrow(
      /BITBUCKET_APP_CLIENT_ID/,
    );
  });

  it('returns token on success and caches it', async () => {
    process.env.BITBUCKET_APP_CLIENT_ID = 'abc';
    process.env.BITBUCKET_APP_CLIENT_SECRET = 'def';

    needle.mockResolvedValueOnce({
      body: { access_token: 'tok1', expires_in: 3600 },
    });

    const t1 = await getBitbucketAppToken();
    expect(t1).toBe('tok1');

    // Second call should return cached token; needle should not be called again
    const t2 = await getBitbucketAppToken();
    expect(t2).toBe('tok1');
    expect(needle).toHaveBeenCalledTimes(1);
  });

  it('throws when response missing token', async () => {
    process.env.BITBUCKET_APP_CLIENT_ID = 'abc';
    process.env.BITBUCKET_APP_CLIENT_SECRET = 'def';

    needle.mockResolvedValueOnce({ body: {} });

    await expect(getBitbucketAppToken()).rejects.toThrow(
      /Failed to obtain Bitbucket app token/,
    );
  });
});
