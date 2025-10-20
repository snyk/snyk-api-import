const fs = require('fs');
const path = require('path');

// Basic defaults used by many unit tests to avoid real network calls
process.env.SNYK_API_TEST = process.env.SNYK_API_TEST || 'https://api.snyk.io';
process.env.SNYK_TOKEN_TEST = process.env.SNYK_TOKEN_TEST || 'test-snyk-token';
// Use the canonical test org id used throughout fixtures/tests so mocked
// responses produce the same URLs and ids the tests assert against.
process.env.TEST_ORG_ID =
  process.env.TEST_ORG_ID || '74e2f385-a54f-491e-9034-76c53e72927a';
process.env.TEST_GROUP_ID = process.env.TEST_GROUP_ID || 'test-group-1';

// Provide default GHAS/GHE/GitLab/Bitbucket tokens/URLs used in some tests
process.env.TEST_GHE_URL = process.env.TEST_GHE_URL || 'http://localhost:3000';
process.env.TEST_GHE_TOKEN = process.env.TEST_GHE_TOKEN || 'test-ghe-token';
// Small defaults for integration ids used in many tests
process.env.INTEGRATION_ID = process.env.INTEGRATION_ID || 'abc-defg-0123';
process.env.GHE_INTEGRATION_ID =
  process.env.GHE_INTEGRATION_ID || 'abcw-12456-dafgsdf-ajrgrbz';
process.env.TEST_GITLAB_BASE_URL = process.env.TEST_GITLAB_BASE_URL || 'http://localhost:8888';
process.env.TEST_GITLAB_TOKEN = process.env.TEST_GITLAB_TOKEN || 'test-gitlab-token';
process.env.TEST_BITBUCKET_CLOUD_USERNAME = process.env.TEST_BITBUCKET_CLOUD_USERNAME || 'test-bitbucket-user';

// Mirror primary env vars the code expects
process.env.SNYK_API = process.env.SNYK_API || process.env.SNYK_API_TEST;
process.env.SNYK_TOKEN = process.env.SNYK_TOKEN || process.env.SNYK_TOKEN_TEST;

// Ensure logs directory exists and is consistent across tests
process.env.SNYK_LOG_PATH = process.env.SNYK_LOG_PATH || path.resolve(__dirname, '..', 'test-logs');
const logPath = path.resolve(process.env.SNYK_LOG_PATH);
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
}

// Keep NODE_EXTRA_CA_CERTS if provided by the user (so child node processes inherit it)
if (process.env.NODE_EXTRA_CA_CERTS) {
  // Intentionally no-op: child processes inherit environment variables by default,
  // so there's nothing to reassign here.
}

// For local debugging only: default to relaxed TLS in dev environment; CI should override this
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

// Silence debug logs in tests unless DEBUG is set
if (!process.env.DEBUG) process.env.DEBUG = '';

// Some tests call `jest.spyOn` against namespace imports (for example
// `import * as github from '../../src/lib/source-handlers/github'`). When
// modules are loaded via the TypeScript/Babel pipeline they can end up with
// non-configurable properties which make `jest.spyOn` throw
// "Cannot redefine property". To work around that we replace the module
// exports with a shallow-cloned plain object so tests can spy/replace
// individual functions.
function _makeModuleMutable(relPathFromTestDir) {
  try {
    // resolve from this file's directory and require the module so it's in
    // the require cache. This increases the chance the module exports are
    // present and can be shallow-cloned for tests that call `jest.spyOn`.
    const resolvedPath = path.join(__dirname, '..', relPathFromTestDir);
    let resolved;
    try {
      resolved = require.resolve(resolvedPath);
      // require the module to populate require.cache (best-effort)
      require(resolved);
    } catch (e) {
      // fall back to trying to require the path directly (ts-jest variations)
      try {
        resolved = require.resolve(resolvedPath.replace(/\.ts$/, '.js'));
        require(resolved);
      } catch (e2) {
        // ignore - resolution may fail for some optional modules
      }
    }
    const cached = resolved && require.cache[resolved];
    if (cached && cached.exports) {
      // shallow clone exported properties onto a new plain object
      const clone = Object.assign({}, cached.exports);
      cached.exports = clone;
      // Also update module.exports in case something required it directly
      try {
        require.cache[resolved].exports = clone;
      } catch (e) {
        // best effort; ignore if we cannot reassign
      }
    }
  } catch (e) {
    // ignore resolution errors; some tests run in environments where these
    // modules are not required or have different paths.
  }
}

// Make commonly spied modules mutable so `jest.spyOn` works reliably.
_makeModuleMutable('src/lib/index.ts');
_makeModuleMutable('src/lib/source-handlers/github/index.ts');
_makeModuleMutable('src/lib/source-handlers/gitlab/index.ts');
_makeModuleMutable('src/lib/source-handlers/bitbucket-server/index.ts');

// When running under Jest the `jest` runtime will expose a global. Use
// `globalThis.jest` (safer for linters) and only attempt the mock-replacement
// if it's available. We also avoid calling `jest.mock` for modules that are
// already present in the require cache - the `_makeModuleMutable` above is a
// best-effort approach that covers the common cases.
try {
  // Access the global object in a way that's friendly to older linters/runtimes
  const _getGlobal = () => {
    try {
      // prefer globalThis when available
      // eslint-disable-next-line no-undef
      if (typeof globalThis !== 'undefined') return globalThis;
    } catch (e) {
      /* ignore */
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('global detection step1 failed');
      }
    }
    try {
      // Node-style global
      // eslint-disable-next-line no-undef
      if (typeof global !== 'undefined') return global;
    } catch (e) {
      /* ignore */
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('global detection step2 failed');
      }
    }
    try {
      // Browser-style window
      // eslint-disable-next-line no-undef
      if (typeof window !== 'undefined') return window;
    } catch (e) {
      /* ignore */
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('global detection step3 failed');
      }
    }
    // Fallback to Function constructor to get global object
    return Function('return this')();
  };
  const jestGlobal = _getGlobal().jest;
  if (jestGlobal && typeof jestGlobal.requireActual === 'function') {
    const _makeMockMutable = (relPath) => {
      try {
        const abs = path.join(process.cwd(), relPath);
        const resolved = require.resolve(abs);
        const actual = jestGlobal.requireActual(resolved);
        const copy = Object.assign({}, actual);
        // Only mock if not already mocked
        try {
          jestGlobal.mock(resolved, () => copy, { virtual: false });
        } catch (e) {
          // ignore - some modules cannot be mocked this way in some runtimes
        }
      } catch (e) {
        // ignore optional modules or resolution failures
      }
    };

    // Note: we do not re-run the mockization calls for the same modules here
    // because `_makeModuleMutable` above already performs a shallow-clone of
    // the module exports in the require cache. Repeating the calls was
    // redundant and could cause confusing behaviour in some runtimes.
  }
} catch (e) {
  // swallowing exceptions here - this is a non-critical test setup step
}
