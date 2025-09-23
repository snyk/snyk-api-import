import { isConfigured } from '../../../../src/lib/source-handlers/bitbucket-cloud-app/is-configured';

describe('isConfigured', () => {
  it('returns false if env vars are missing', () => {
    const original = { ...process.env };
    delete process.env.BITBUCKET_APP_CLIENT_ID;
    delete process.env.BITBUCKET_APP_CLIENT_SECRET;
    expect(isConfigured()).toBe(false);
    process.env = original;
  });

  it('returns true if env vars are set', () => {
    process.env.BITBUCKET_APP_CLIENT_ID = 'id';
    process.env.BITBUCKET_APP_CLIENT_SECRET = 'secret';
    expect(isConfigured()).toBe(true);
  });
});
