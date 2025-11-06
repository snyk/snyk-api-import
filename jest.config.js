/* eslint-disable @typescript-eslint/naming-convention */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^simple-git$': '<rootDir>/test/simple-git.mock.ts',
    '^snyk-request-manager$': '<rootDir>/test/snyk-request-manager.mock.ts',
    '^needle$': '<rootDir>/test/needle.mock.ts',
  },
  collectCoverageFrom: ['lib/**/*.ts'],
  coverageReporters: ['text-summary', 'html'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/system/'],
  transformIgnorePatterns: ['/node_modules/(?!memfs|nock|@octokit)/'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest',
  },
};
