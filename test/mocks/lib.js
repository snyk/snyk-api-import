// Shallow-clone of the real `src/lib` module so tests can spy on
// exported functions. This file intentionally requires the real module and
// re-exports a plain object to make properties configurable for jest.spyOn.
const real = require('../..//src/lib/index.ts');
module.exports = Object.assign({}, real);
