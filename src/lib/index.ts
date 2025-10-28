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
// Helper to copy exported members onto module.exports as plain,
// configurable properties so test helpers like jest.spyOn can redefine them.
const copyExports = (target: any, src: Record<string, any>) => {
  for (const key of Object.keys(src)) {
    try {
      Object.defineProperty(target, key, {
        value: (src as any)[key],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } catch {
      // ignore errors defensively
    }
  }
};

copyExports(module.exports, apiImport);
copyExports(module.exports, apiPollImport);
copyExports(module.exports, apiProject);
copyExports(module.exports, apiGroup);
copyExports(module.exports, apiOrg);

copyExports(module.exports, getApiToken);
copyExports(module.exports, getConcurrent);
copyExports(module.exports, getImportPath);
copyExports(module.exports, getLoggingPath);
copyExports(module.exports, getSnykHost);
copyExports(module.exports, filterOutExistingOrgs);
copyExports(module.exports, supportedProjectTypes);
copyExports(module.exports, findFiles);
copyExports(module.exports, gitClone);

copyExports(module.exports, sourceGithub);
copyExports(module.exports, sourceGitlab);
copyExports(module.exports, sourceGithubCloudApp);
copyExports(module.exports, sourceAzure);
copyExports(module.exports, sourceBitbucketServer);
copyExports(module.exports, sourceBitbucketCloud);
copyExports(module.exports, sourceBitbucketCloudApp);
