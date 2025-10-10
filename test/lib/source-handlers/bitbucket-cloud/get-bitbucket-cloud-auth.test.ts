import {
  getBitbucketCloudAuth,
  getAvailableBitbucketCloudAuths,
} from '../../../../src/lib/source-handlers/bitbucket-cloud/get-bitbucket-cloud-auth';

describe('getBitbucketCloudAuth helper', () => {
  const ENV_VARS = [
    'BITBUCKET_CLOUD_API_TOKEN',
    'BITBUCKET_CLOUD_OAUTH_TOKEN',
    'BITBUCKET_CLOUD_USERNAME',
    'BITBUCKET_CLOUD_PASSWORD',
  ];
  const origEnv = { ...process.env };

  afterEach(() => {
    // restore original env
    process.env = { ...origEnv } as NodeJS.ProcessEnv;
  });

  function clearVars() {
    for (const k of ENV_VARS) {
      delete process.env[k];
    }
  }

  it('throws when no env vars are set', () => {
    clearVars();
    expect(() => getBitbucketCloudAuth()).toThrow();
  });

  it('returns api when BITBUCKET_CLOUD_API_TOKEN is set', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_API_TOKEN = 'apitoken123';
    const auth = getBitbucketCloudAuth();
    expect(auth).toHaveProperty('type', 'api');
  expect(auth).toHaveProperty('token', 'apitoken123');
  });

  it('returns oauth when only BITBUCKET_CLOUD_OAUTH_TOKEN is set', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_OAUTH_TOKEN = 'oauthtoken123';
    const auth = getBitbucketCloudAuth();
    expect(auth).toHaveProperty('type', 'oauth');
  expect(auth).toHaveProperty('token', 'oauthtoken123');
  });

  it('returns user when username and password are set', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_USERNAME = 'alice';
    process.env.BITBUCKET_CLOUD_PASSWORD = 'p@ssw0rd';
  const auth = getBitbucketCloudAuth() as { type: 'user'; username: string; appPassword?: string; password?: string };
  expect(auth).toHaveProperty('type', 'user');
  expect(auth).toHaveProperty('username', 'alice');
  expect(auth.appPassword || auth.password).toBe('p@ssw0rd');
  });

  it('follows precedence api -> oauth -> user when multiple are present', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_USERNAME = 'bob';
    process.env.BITBUCKET_CLOUD_PASSWORD = 'pw';
    process.env.BITBUCKET_CLOUD_OAUTH_TOKEN = 'oauthtok';
    process.env.BITBUCKET_CLOUD_API_TOKEN = 'apitok';
    const auth = getBitbucketCloudAuth();
    expect(auth).toHaveProperty('type', 'api');
  expect(auth).toHaveProperty('token', 'apitok');
    const available = getAvailableBitbucketCloudAuths();
    expect(available.api).toBeDefined();
    expect(available.oauth).toBeDefined();
    expect(available.user).toBeDefined();
  });

  it('allows explicit selection: user present -> getBitbucketCloudAuth("user")', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_USERNAME = 'carol';
    process.env.BITBUCKET_CLOUD_PASSWORD = 'pw2';
    const auth = getBitbucketCloudAuth('user');
  expect(auth).toHaveProperty('type', 'user');
  expect(auth).toHaveProperty('username', 'carol');
  });

  it('throws when explicit method requested but not present', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_API_TOKEN = 'apitoken';
    expect(() => getBitbucketCloudAuth('user')).toThrow();
  });

  it('treats whitespace-only env vars as unset', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_API_TOKEN = '   ';
    process.env.BITBUCKET_CLOUD_OAUTH_TOKEN = '\n\t';
    process.env.BITBUCKET_CLOUD_USERNAME = '   ';
    process.env.BITBUCKET_CLOUD_PASSWORD = '   ';
    expect(() => getBitbucketCloudAuth()).toThrow();
  });

  it('honors BITBUCKET_CLOUD_AUTH_METHOD override', () => {
    clearVars();
    process.env.BITBUCKET_CLOUD_API_TOKEN = 'apitokoverride';
    process.env.BITBUCKET_CLOUD_OAUTH_TOKEN = 'oauthtokoverride';
    process.env.BITBUCKET_CLOUD_USERNAME = 'dave';
    process.env.BITBUCKET_CLOUD_PASSWORD = 'pw3';
    process.env.BITBUCKET_CLOUD_AUTH_METHOD = 'oauth';
    const auth = getBitbucketCloudAuth();
    expect(auth).toHaveProperty('type', 'oauth');
  expect(auth).toHaveProperty('token', 'oauthtokoverride');
  });
});
