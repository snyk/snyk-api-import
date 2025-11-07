/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-require-imports */
// Static adapter registry to avoid runtime dynamic-requires.
// Export a map of known adapter names to functions that load them.
// This makes it explicit for bundlers/packers and is a stepping stone
// to refactoring dynamic require sites into static lookups.
type AdapterLoader = () => unknown | undefined;

export const adapterLoaders: Record<string, AdapterLoader> = {
  '@keyv/redis': () => {
    try {
      return require('@keyv/redis');
    } catch {
      return undefined;
    }
  },
  '@keyv/mongo': () => {
    try {
      return require('@keyv/mongo');
    } catch {
      return undefined;
    }
  },
  '@keyv/sqlite': () => {
    try {
      return require('@keyv/sqlite');
    } catch {
      return undefined;
    }
  },
  '@keyv/postgres': () => {
    try {
      return require('@keyv/postgres');
    } catch {
      return undefined;
    }
  },
  '@keyv/mysql': () => {
    try {
      return require('@keyv/mysql');
    } catch {
      return undefined;
    }
  },
  '@keyv/etcd': () => {
    try {
      return require('@keyv/etcd');
    } catch {
      return undefined;
    }
  },
  '@keyv/offline': () => {
    try {
      return require('@keyv/offline');
    } catch {
      return undefined;
    }
  },
  '@keyv/tiered': () => {
    try {
      return require('@keyv/tiered');
    } catch {
      return undefined;
    }
  },
  '@octokit/rest': () => {
    try {
      return require('@octokit/rest');
    } catch {
      return undefined;
    }
  },
  '@gitbeaker/core': () => {
    try {
      return require('@gitbeaker/core');
    } catch {
      return undefined;
    }
  },
  '@gitbeaker/node': () => {
    try {
      return require('@gitbeaker/node');
    } catch {
      return undefined;
    }
  },
  'snyk-request-manager': () => {
    try {
      return require('snyk-request-manager');
    } catch {
      return undefined;
    }
  },
  axios: () => {
    try {
      return require('axios');
    } catch {
      return undefined;
    }
  },
};

export function loadAdapter(name: string) {
  const loader = adapterLoaders[name];
  if (!loader) return undefined;
  return loader();
}

export function knownAdapterNames() {
  return Object.keys(adapterLoaders);
}

export default { adapterLoaders, loadAdapter, knownAdapterNames };
