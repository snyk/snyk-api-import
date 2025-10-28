// Ensure common optional modules are part of the dependency graph so packers
// (pkg) and bundlers (esbuild) will include them during static analysis.
// Keep this list minimal and update when pkg warns about missing modules.
/* eslint-disable @typescript-eslint/no-require-imports */
try {
  require('@keyv/redis');
} catch {
  void 0;
}
try {
  require('@keyv/mongo');
} catch {
  void 0;
}
try {
  require('@keyv/sqlite');
} catch {
  void 0;
}
try {
  require('@keyv/postgres');
} catch {
  void 0;
}
try {
  require('@keyv/mysql');
} catch {
  void 0;
}
try {
  require('@keyv/etcd');
} catch {
  void 0;
}
try {
  require('@keyv/offline');
} catch {
  void 0;
}
try {
  require('@keyv/tiered');
} catch {
  void 0;
}
try {
  require('@octokit/rest');
} catch {
  void 0;
}
try {
  require('@gitbeaker/core');
} catch {
  void 0;
}
try {
  require('@gitbeaker/node');
} catch {
  void 0;
}
try {
  require('snyk-request-manager');
} catch {
  void 0;
}
try {
  require('axios');
} catch {
  void 0;
}
try {
  require('dtrace-provider');
} catch {
  void 0;
}

// Also export a static registry for future refactors that replace
// dynamic require sites with a static lookup.
import { knownAdapterNames, loadAdapter } from './adapter-registry';

// Attempt to load known adapters via the registry so packers detect them
// during static analysis (this is best-effort and will silently ignore
// adapters that are not installed).
knownAdapterNames().forEach((n) => void loadAdapter(n));

export {};
