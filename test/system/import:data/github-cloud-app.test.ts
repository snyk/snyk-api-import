import { generateOrgData } from '../../../src/cmds/import:data';

describe('GitHub Cloud App import:data integration', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
  });

  it('should fail when GitHub Cloud App is not configured', async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    // Create a minimal orgs data file for testing
    const testOrgsData = JSON.stringify({
      orgData: [
        {
          name: 'test-org',
          orgId: 'test-org-id',
          integrations: {
            'github-cloud-app': 'integration-id',
          },
        },
      ],
    });

    // Mock the loadFile function by creating a temporary file
    const fs = require('fs'); // eslint-disable-line @typescript-eslint/no-var-requires
    const path = require('path'); // eslint-disable-line @typescript-eslint/no-var-requires
    const tempFile = path.join(__dirname, 'temp-orgs-data.json');

    try {
      fs.writeFileSync(tempFile, testOrgsData);

      const result = await generateOrgData(
        'github-cloud-app' as any,
        tempFile,
        '',
      );

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('No targets could be generated');
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('should fail with invalid configuration', async () => {
    process.env.GITHUB_APP_ID = 'not-numeric';
    process.env.GITHUB_APP_PRIVATE_KEY = 'invalid-key';

    const testOrgsData = JSON.stringify({
      orgData: [
        {
          name: 'test-org',
          orgId: 'test-org-id',
          integrations: {
            'github-cloud-app': 'integration-id',
          },
        },
      ],
    });

    const fs = require('fs'); // eslint-disable-line @typescript-eslint/no-var-requires
    const path = require('path'); // eslint-disable-line @typescript-eslint/no-var-requires
    const tempFile = path.join(__dirname, 'temp-orgs-data.json');

    try {
      fs.writeFileSync(tempFile, testOrgsData);

      const result = await generateOrgData(
        'github-cloud-app' as any,
        tempFile,
        '',
      );

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('No targets could be generated');
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  // Note: Integration tests with real GitHub App would require actual credentials
  it.skip('should successfully generate targets when properly configured', async () => {
    // This test would require real GitHub App credentials
    // and should be run in a controlled test environment
    process.env.GITHUB_APP_ID = process.env.TEST_GITHUB_APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY =
      process.env.TEST_GITHUB_APP_PRIVATE_KEY;

    const testOrgsData = JSON.stringify({
      orgData: [
        {
          name: process.env.TEST_GITHUB_ORG_NAME || 'test-org',
          orgId: 'test-org-id',
          integrations: {
            'github-cloud-app': 'integration-id',
          },
        },
      ],
    });

    const fs = require('fs'); // eslint-disable-line @typescript-eslint/no-var-requires
    const path = require('path'); // eslint-disable-line @typescript-eslint/no-var-requires
    const tempFile = path.join(__dirname, 'temp-orgs-data.json');

    try {
      fs.writeFileSync(tempFile, testOrgsData);

      const result = await generateOrgData(
        'github-cloud-app' as any,
        tempFile,
        '',
      );

      expect(result.exitCode).toBe(0);
      expect(result.message).toContain('Found');
      expect(result.fileName).toContain('github-cloud-app');
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
