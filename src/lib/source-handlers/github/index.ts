export * from './list-organizations';
export * from './list-repos';
export * from './organization-is-empty';
export * from './get-repo-metadata';
export * from './types';
export * from './is-configured';
export * from './git-clone-url';
// At runtime, also copy the concrete properties from the modules onto
// module.exports so that properties are plain, configurable properties
// (jest.spyOn can redefine them). We keep the ES `export *` lines so
// TypeScript sees the named exports statically.

import * as listOrganizations from './list-organizations';
import * as listRepos from './list-repos';
import * as organizationIsEmpty from './organization-is-empty';
import * as getRepoMetadata from './get-repo-metadata';
import * as types from './types';
import * as isConfigured from './is-configured';
import * as gitCloneUrl from './git-clone-url';

Object.assign(module.exports, listOrganizations);
Object.assign(module.exports, listRepos);
Object.assign(module.exports, organizationIsEmpty);
Object.assign(module.exports, getRepoMetadata);
Object.assign(module.exports, types);
Object.assign(module.exports, isConfigured);
Object.assign(module.exports, gitCloneUrl);
