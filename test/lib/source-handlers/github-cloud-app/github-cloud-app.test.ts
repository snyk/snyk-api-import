import * as githubCloudApp from '../../../../src/lib/source-handlers/github-cloud-app';

describe('GitHub Cloud App Integration', () => {
  const OLD_ENV = process.env;

  afterEach(async () => {
    process.env = { ...OLD_ENV };
    // Clear any cached tokens
    githubCloudApp.clearTokenCache();
  });

  describe('isGitHubCloudAppConfigured', () => {
    it('should return true when properly configured', () => {
      process.env.GITHUB_APP_ID = '123456';
      process.env.GITHUB_APP_PRIVATE_KEY = ``;

      const configured = githubCloudApp.isGitHubCloudAppConfigured();
      expect(configured).toBe(true);
    });

    it('should return false when GITHUB_APP_ID is missing', () => {
      delete process.env.GITHUB_APP_ID;
      process.env.GITHUB_APP_PRIVATE_KEY = ``;

      const configured = githubCloudApp.isGitHubCloudAppConfigured();
      expect(configured).toBe(false);
    });

    it('should return false when GITHUB_APP_PRIVATE_KEY is missing', () => {
      process.env.GITHUB_APP_ID = '123456';
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      const configured = githubCloudApp.isGitHubCloudAppConfigured();
      expect(configured).toBe(false);
    });

    it('should return false when private key is not in PEM format', () => {
      process.env.GITHUB_APP_ID = '123456';
      process.env.GITHUB_APP_PRIVATE_KEY = 'not-a-pem-key';

      const configured = githubCloudApp.isGitHubCloudAppConfigured();
      expect(configured).toBe(false);
    });

    it('should return false when app ID is not numeric', () => {
      process.env.GITHUB_APP_ID = 'not-numeric';
      process.env.GITHUB_APP_PRIVATE_KEY = ``;

      const configured = githubCloudApp.isGitHubCloudAppConfigured();
      expect(configured).toBe(false);
    });
  });

  describe('getGitHubCloudAppConfigurationError', () => {
    it('should return error message for missing app ID', () => {
      delete process.env.GITHUB_APP_ID;
      process.env.GITHUB_APP_PRIVATE_KEY = ``;

      const error = githubCloudApp.getGitHubCloudAppConfigurationError();
      expect(error).toContain('GITHUB_APP_ID environment variable is not set');
    });

    it('should return error message for missing private key', () => {
      process.env.GITHUB_APP_ID = '123456';
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      const error = githubCloudApp.getGitHubCloudAppConfigurationError();
      expect(error).toContain(
        'GITHUB_APP_PRIVATE_KEY environment variable is not set',
      );
    });

    it('should return error message for invalid private key format', () => {
      process.env.GITHUB_APP_ID = '123456';
      process.env.GITHUB_APP_PRIVATE_KEY = 'not-a-pem-key';

      const error = githubCloudApp.getGitHubCloudAppConfigurationError();
      expect(error).toContain('must be in PEM format');
    });

    it('should return error message for invalid app ID format', () => {
      process.env.GITHUB_APP_ID = 'not-numeric';
      process.env.GITHUB_APP_PRIVATE_KEY = ``;

      const error = githubCloudApp.getGitHubCloudAppConfigurationError();
      expect(error).toContain('must be a numeric string');
    });
  });

  describe('getGitHubAppToken', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(githubCloudApp.getGitHubAppToken()).rejects.toThrow(
        'GITHUB_APP_ID environment variable is required',
      );
    });

    it('should throw error for invalid configuration', async () => {
      process.env.GITHUB_APP_ID = 'not-numeric';
      process.env.GITHUB_APP_PRIVATE_KEY = 'invalid-key';

      await expect(githubCloudApp.getGitHubAppToken()).rejects.toThrow(
        'Failed to authenticate with GitHub App',
      );
    });
  });

  describe('getGitHubCloudAppCloneUrl', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(
        githubCloudApp.getGitHubCloudAppCloneUrl('owner', 'repo'),
      ).rejects.toThrow('GITHUB_APP_ID environment variable is required');
    });
  });

  describe('getGitHubCloudAppSshCloneUrl', () => {
    it('should return correct SSH clone URL', () => {
      const url = githubCloudApp.getGitHubCloudAppSshCloneUrl('owner', 'repo');
      expect(url).toBe('git@github.com:owner/repo.git');
    });
  });

  describe('listGitHubCloudAppOrgs', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(githubCloudApp.listGitHubCloudAppOrgs()).rejects.toThrow(
        'GITHUB_APP_ID environment variable is required',
      );
    });
  });

  describe('listGitHubCloudAppRepos', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(
        githubCloudApp.listGitHubCloudAppRepos('test-org'),
      ).rejects.toThrow('GITHUB_APP_ID environment variable is required');
    });
  });

  describe('githubCloudAppOrganizationIsEmpty', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(
        githubCloudApp.githubCloudAppOrganizationIsEmpty('test-org'),
      ).rejects.toThrow('GITHUB_APP_ID environment variable is required');
    });
  });

  describe('getGitHubCloudAppRepoMetadata', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(
        githubCloudApp.getGitHubCloudAppRepoMetadata('owner', 'repo'),
      ).rejects.toThrow('GITHUB_APP_ID environment variable is required');
    });
  });

  describe('clearTokenCache', () => {
    it('should clear cached tokens', () => {
      // This test ensures the function exists and can be called
      expect(() => githubCloudApp.clearTokenCache()).not.toThrow();
    });
  });
});
