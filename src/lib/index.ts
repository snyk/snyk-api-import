export * from './api/import';
export * from './api/poll-import';
export * from './api/project';
export * from './api/group';
export * from './api/org';

export * from './get-api-token';
export * from './get-concurrent-imports-number';
export * from './get-import-path';
export * from './get-logging-path';
export * from './get-snyk-host';
export * from './filter-out-existing-orgs';
export * from './supported-project-types';
export * from './find-files';
export * from './git-clone';

export * from './source-handlers/github';
export * from './source-handlers/gitlab';
export * from './source-handlers/github-cloud-app';
export * from './source-handlers/azure';
export * from './source-handlers/bitbucket-server';
export * from './source-handlers/bitbucket-cloud';
export * from './source-handlers/bitbucket-cloud-app';

// At runtime, copy concrete properties from the modules onto module.exports
// so that properties are plain, configurable properties and can be spied on
// by tests (jest.spyOn). We keep the `export *` lines above for TypeScript
// static analysis.
/* eslint-disable @typescript-eslint/no-var-requires */
try {
  const apiImport = require('./api/import');
  const apiPollImport = require('./api/poll-import');
  const apiProject = require('./api/project');
  const apiGroup = require('./api/group');
  const apiOrg = require('./api/org');

  const getApiToken = require('./get-api-token');
  const getConcurrent = require('./get-concurrent-imports-number');
  const getImportPath = require('./get-import-path');
  const getLoggingPath = require('./get-logging-path');
  const getSnykHost = require('./get-snyk-host');
  const filterOutExistingOrgs = require('./filter-out-existing-orgs');
  const supportedProjectTypes = require('./supported-project-types');
  const findFiles = require('./find-files');
  const gitClone = require('./git-clone');

  const sourceGithub = require('./source-handlers/github');
  const sourceGitlab = require('./source-handlers/gitlab');
  const sourceGithubCloudApp = require('./source-handlers/github-cloud-app');
  const sourceAzure = require('./source-handlers/azure');
  const sourceBitbucketServer = require('./source-handlers/bitbucket-server');
  const sourceBitbucketCloud = require('./source-handlers/bitbucket-cloud');
  const sourceBitbucketCloudApp = require('./source-handlers/bitbucket-cloud-app');

  Object.assign(module.exports, apiImport);
  Object.assign(module.exports, apiPollImport);
  Object.assign(module.exports, apiProject);
  Object.assign(module.exports, apiGroup);
  Object.assign(module.exports, apiOrg);

  Object.assign(module.exports, getApiToken);
  Object.assign(module.exports, getConcurrent);
  Object.assign(module.exports, getImportPath);
  Object.assign(module.exports, getLoggingPath);
  Object.assign(module.exports, getSnykHost);
  Object.assign(module.exports, filterOutExistingOrgs);
  Object.assign(module.exports, supportedProjectTypes);
  Object.assign(module.exports, findFiles);
  Object.assign(module.exports, gitClone);

  Object.assign(module.exports, sourceGithub);
  Object.assign(module.exports, sourceGitlab);
  Object.assign(module.exports, sourceGithubCloudApp);
  Object.assign(module.exports, sourceAzure);
  Object.assign(module.exports, sourceBitbucketServer);
  Object.assign(module.exports, sourceBitbucketCloud);
  Object.assign(module.exports, sourceBitbucketCloudApp);
} catch (e) {
  // ignore in environments where require isn't available
}
/* eslint-enable @typescript-eslint/no-var-requires */
