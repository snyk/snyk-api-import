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
/* eslint-disable @typescript-eslint/no-var-requires */
try {
	const listOrganizations = require('./list-organizations');
	const listRepos = require('./list-repos');
	const organizationIsEmpty = require('./organization-is-empty');
	const getRepoMetadata = require('./get-repo-metadata');
	const types = require('./types');
	const isConfigured = require('./is-configured');
	const gitCloneUrl = require('./git-clone-url');

	Object.assign(module.exports, listOrganizations);
	Object.assign(module.exports, listRepos);
	Object.assign(module.exports, organizationIsEmpty);
	Object.assign(module.exports, getRepoMetadata);
	Object.assign(module.exports, types);
	Object.assign(module.exports, isConfigured);
	Object.assign(module.exports, gitCloneUrl);
} catch (e) {
	// If require fails during static analysis or other tooling, ignore.
}
/* eslint-enable @typescript-eslint/no-var-requires */
