#!/usr/bin/env node
/*
 Programmatic esbuild build that replaces occurrences of import.meta.url with
 a safe helper and emits dist/index.js. This avoids post-bundle patching.
*/
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const importMetaPlugin = {
  name: 'import-meta-replace',
  setup(build) {
    const filter = /\.(m?js|ts|tsx)$/;
    build.onLoad({ filter }, async (args) => {
      const contents = await fs.promises.readFile(args.path, 'utf8');
      // Replace import.meta.url with a safe call to __import_meta_url()
      const replaced = contents.replace(
        /import\.meta\.url/g,
        '__import_meta_url()',
      );
      const ext = path.extname(args.path).toLowerCase();
      let loader = 'js';
      if (ext === '.ts' || ext === '.tsx') loader = 'ts';
      return { contents: replaced, loader };
    });
  },
};

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/index.js',
    sourcemap: true,
    // Avoid scanning optional native bindings (dtrace-provider) which emit
    // empty-glob warnings during bundle analysis. It's an optional,
    // platform-specific module and should remain external to the bundle.
    external: ['dtrace-provider'],
    plugins: [importMetaPlugin],
    banner: {
      js: `function __import_meta_url(){ try{ if(typeof __filename !== 'undefined') return new URL('file://'+__filename); }catch(e){} return undefined; }`,
    },
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
