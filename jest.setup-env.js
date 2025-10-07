// Set default env vars for local test reliability
process.env.SNYK_API = process.env.SNYK_API || 'https://snyk.io/api/v1';
process.env.SNYK_TOKEN = process.env.SNYK_TOKEN || 'test-token';
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'ghp_testtoken';
process.env.GITLAB_TOKEN = process.env.GITLAB_TOKEN || 'glpat_testtoken';
process.env.BITBUCKET_CLOUD_USERNAME = process.env.BITBUCKET_CLOUD_USERNAME || 'test-bb-user';
process.env.BITBUCKET_CLOUD_PASSWORD = process.env.BITBUCKET_CLOUD_PASSWORD || 'test-bb-pass';
process.env.BBS_TOKEN = process.env.BBS_TOKEN || 'test-bbs-token';
process.env.BBS_SOURCE_URL = process.env.BBS_SOURCE_URL || 'https://bitbucket-server.test';
process.env.TEST_GHE_URL = process.env.TEST_GHE_URL || 'https://ghe.test';
process.env.TEST_GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL || 'https://gitlab.test';
process.env.TEST_ORG_ID = process.env.TEST_ORG_ID || 'test-org-id';
