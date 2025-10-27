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

import * as apiImport from './api/import';
import * as apiPollImport from './api/poll-import';
import * as apiProject from './api/project';
import * as apiGroup from './api/group';
import * as apiOrg from './api/org';

import * as getApiToken from './get-api-token';
import * as getConcurrent from './get-concurrent-imports-number';
import * as getImportPath from './get-import-path';
import * as getLoggingPath from './get-logging-path';
import * as getSnykHost from './get-snyk-host';
import * as filterOutExistingOrgs from './filter-out-existing-orgs';
import * as supportedProjectTypes from './supported-project-types';
import * as findFiles from './find-files';
import * as gitClone from './git-clone';

import * as sourceGithub from './source-handlers/github';
import * as sourceGitlab from './source-handlers/gitlab';
import * as sourceGithubCloudApp from './source-handlers/github-cloud-app';
import * as sourceAzure from './source-handlers/azure';
import * as sourceBitbucketServer from './source-handlers/bitbucket-server';
import * as sourceBitbucketCloud from './source-handlers/bitbucket-cloud';
import * as sourceBitbucketCloudApp from './source-handlers/bitbucket-cloud-app';

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
