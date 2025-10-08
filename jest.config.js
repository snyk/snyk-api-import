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
};
