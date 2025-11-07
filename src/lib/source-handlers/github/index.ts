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

// Copy exported members onto module.exports as plain, configurable properties
// so test helpers like jest.spyOn can redefine them. We avoid Object.assign
// because TypeScript's emitted getters can produce non-writable descriptors.
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
      // defensive: ignore failures to define (should be rare)
    }
  }
};

copyExports(module.exports, listOrganizations);
copyExports(module.exports, listRepos);
copyExports(module.exports, organizationIsEmpty);
copyExports(module.exports, getRepoMetadata);
copyExports(module.exports, types);
copyExports(module.exports, isConfigured);
copyExports(module.exports, gitCloneUrl);
