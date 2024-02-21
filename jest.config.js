module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['lib/**/*.ts'],
  coverageReporters: ['text-summary', 'html'],
  moduleNameMapper: {
    '^axios$': 'axios/dist/node/axios.cjs',
  },
};
