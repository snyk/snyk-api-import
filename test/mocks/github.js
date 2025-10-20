// Shallow-clone of the real `src/lib/source-handlers/github` module so tests
// that import it as a namespace can be spied on.
const real = require('../../src/lib/source-handlers/github/index.ts');
module.exports = Object.assign({}, real);
