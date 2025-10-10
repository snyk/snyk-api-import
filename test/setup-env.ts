// Test setup: provide safe defaults for environment variables used across tests
process.env.SNYK_API_TEST = process.env.SNYK_API_TEST || 'https://api.snyk.io';
process.env.SNYK_TOKEN_TEST = process.env.SNYK_TOKEN_TEST || 'test-token';
process.env.SNYK_API = process.env.SNYK_API || process.env.SNYK_API_TEST;
process.env.SNYK_TOKEN = process.env.SNYK_TOKEN || process.env.SNYK_TOKEN_TEST;

process.env.TEST_GH_ORG_NAME = process.env.TEST_GH_ORG_NAME || 'test-gh-org';
process.env.TEST_GHE_URL = process.env.TEST_GHE_URL || 'https://ghe.example';
process.env.TEST_GHE_TOKEN = process.env.TEST_GHE_TOKEN || 'test-ghe-token';

process.env.TEST_GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL || 'https://gitlab.example';
process.env.TEST_GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN || 'test-gitlab-token';
process.env.TEST_GITLAB_ORG_NAME = process.env.TEST_GITLAB_ORG_NAME || 'test-gitlab-org';

// Bitbucket defaults for tests
process.env.BBS_SOURCE_URL = process.env.BBS_SOURCE_URL || 'https://bb.example';
process.env.BBS_TOKEN = process.env.BBS_TOKEN || 'test-bbs-token';
process.env.BBC_USERNAME = process.env.BBC_USERNAME || 'bb-user';
process.env.BBC_PASSWORD = process.env.BBC_PASSWORD || 'bb-pass';

// Provide a default logging path used by writeFile
process.env.SNYK_LOG_PATH = process.env.SNYK_LOG_PATH || 'test/system/fixtures';
// Common Snyk test defaults
process.env.SNYK_API = process.env.SNYK_API || 'http://localhost:12345';
process.env.SNYK_TOKEN = process.env.SNYK_TOKEN || 'test-snyk-token';
process.env.ORG_ID = process.env.ORG_ID || 'org-id-test';
process.env.TEST_ORG_ID = process.env.TEST_ORG_ID || 'org-id-test';
process.env.INTEGRATION_ID = process.env.INTEGRATION_ID || 'github-********-********-********';
process.env.GHE_TEST_ORG = process.env.GHE_TEST_ORG || 'ghe-org';

// Provide a default import path and logging path for system tests
process.env.SNYK_IMPORT_PATH = process.env.SNYK_IMPORT_PATH || 'test/system/fixtures';
process.env.SNYK_LOG_PATH = process.env.SNYK_LOG_PATH || 'test/system/fixtures';

// Minimal no-op mocks (some tests spyOn these functions)
// Do not require the library here — some tests mock 'fs' (memfs) at the
// test-file level. Requiring src/lib here would load modules before those
// mocks are applied and cause tests to touch the real filesystem. Tests
// that need to override getLoggingPath should mock/spyOn it locally.

// Ensure test fixtures directory exists
import * as fs from 'fs';
import * as path from 'path';
const fixturesPath = path.resolve(__dirname, 'system', 'fixtures');
try {
  fs.mkdirSync(fixturesPath, { recursive: true });
} catch (e) {
  // ignore
}

// Other global test setup can go here

export {};
