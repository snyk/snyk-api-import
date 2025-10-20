// Shallow-clone of the real `src/lib/source-handlers/bitbucket-server` module
// so tests that import it as a namespace can be spied on.
const real = require('../../src/lib/source-handlers/bitbucket-server/index.ts');
module.exports = Object.assign({}, real);
