import { generateOrgImportData } from '../../../src/cmds/orgs:data';

describe('GitHub Cloud App orgs:data integration', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });

  it('should fail when GitHub Cloud App is not configured', async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    const result = await generateOrgImportData(
      'github-cloud-app' as any,
      'test-group-id',
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain(
      'GITHUB_APP_ID environment variable is required',
    );
  });

  it('should fail with invalid app ID format', async () => {
    process.env.GITHUB_APP_ID = 'not-numeric';
    process.env.GITHUB_APP_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA4f5wg5l2hKsTeNem/V41fGnJm6gOdrj8ym3rFkEjWT2btf0F
3gVb7uQ61hzGkf7+6fTWG5JTmcafqCe0xAMRfWVRMxdEuhOWG2UK2gfVe42O8BJU
-----END RSA PRIVATE KEY-----`;

    const result = await generateOrgImportData(
      'github-cloud-app' as any,
      'test-group-id',
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('GITHUB_APP_ID must be a numeric string');
  });

  it('should fail with invalid private key format', async () => {
    process.env.GITHUB_APP_ID = '123456';
    process.env.GITHUB_APP_PRIVATE_KEY = 'not-a-pem-key';

    const result = await generateOrgImportData(
      'github-cloud-app' as any,
      'test-group-id',
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('must be in PEM format');
  });

  // Note: Integration tests with real GitHub App would require actual credentials
  // and are typically run in CI/CD environments with proper test credentials
  it.skip('should successfully list organizations when properly configured', async () => {
    // This test would require real GitHub App credentials
    // and should be run in a controlled test environment
    process.env.GITHUB_APP_ID = process.env.TEST_GITHUB_APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY =
      process.env.TEST_GITHUB_APP_PRIVATE_KEY;

    const result = await generateOrgImportData(
      'github-cloud-app' as any,
      'test-group-id',
    );

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('Found');
    expect(result.fileName).toContain('github-cloud-app');
  });
});
