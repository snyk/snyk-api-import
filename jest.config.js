/* eslint-disable @typescript-eslint/naming-convention */

module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  collectCoverageFrom: ['lib/**/*.ts'],
  coverageReporters: ['text-summary', 'html'],
  transformIgnorePatterns: ['/node_modules/(?!memfs|nock|@octokit)/'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^snyk-request-manager$': '<rootDir>/test/mocks/snyk-request-manager.js',
    // Map the internal src modules to mutable test mocks so tests can spy on
    // their exported functions reliably even when transpiled by ts-jest.
    'src/lib$': '<rootDir>/test/mocks/lib.js',
    'src/lib/source-handlers/github$': '<rootDir>/test/mocks/github.js',
    'src/lib/source-handlers/gitlab$': '<rootDir>/test/mocks/gitlab.js',
    'src/lib/source-handlers/bitbucket-server$': '<rootDir>/test/mocks/bitbucket-server.js',
  },
  setupFiles: ['<rootDir>/test/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/test/lib/source-handlers/github-cloud-app'],
};
