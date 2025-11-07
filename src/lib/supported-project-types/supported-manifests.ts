/* eslint-disable @typescript-eslint/naming-convention */
export type SnykProductEntitlement =
  | 'dockerfileFromScm'
  | 'infrastructureAsCode'
  | 'openSource';

export const OPEN_SOURCE_PACKAGE_MANAGERS: {
  [projectType: string]: {
    manifestFiles: string[];
    isSupported: boolean;
    entitlement: SnykProductEntitlement;
  };
} = {
  npm: {
    manifestFiles: ['package.json'],
    isSupported: true,
    entitlement: 'openSource',
  },
  rubygems: {
    manifestFiles: ['Gemfile.lock'],
    isSupported: true,
    entitlement: 'openSource',
  },
  yarn: {
    manifestFiles: ['yarn.lock'],
    isSupported: true,
    entitlement: 'openSource',
  },
  'yarn-workspace': {
    manifestFiles: ['yarn.lock'],
    isSupported: true,
    entitlement: 'openSource',
  },
  maven: {
    manifestFiles: ['pom.xml'],
    isSupported: true,
    entitlement: 'openSource',
  },
  gradle: {
    manifestFiles: ['build.gradle'],
    isSupported: true,
    entitlement: 'openSource',
  },
  sbt: {
    manifestFiles: ['build.sbt'],
    isSupported: true,
    entitlement: 'openSource',
  },
  pip: {
    manifestFiles: ['*req*.txt', 'requirements/*.txt'],
    isSupported: true,
    entitlement: 'openSource',
  },
  poetry: {
    manifestFiles: ['pyproject.toml'],
    isSupported: false,
    entitlement: 'openSource',
  },
  golangdep: {
    manifestFiles: ['Gopkg.lock'],
    isSupported: true,
    entitlement: 'openSource',
  },
  govendor: {
    manifestFiles: ['vendor.json'],
    isSupported: true,
    entitlement: 'openSource',
  },
  gomodules: {
    manifestFiles: ['go.mod'],
    isSupported: true,
    entitlement: 'openSource',
  },
  nuget: {
    manifestFiles: [
      'packages.config',
      '*.csproj',
      '*.fsproj',
      '*.vbproj',
      'project.json',
      'project.assets.json',
      '*.targets',
      '*.props',
      'packages*.lock.json',
      'global.json',
    ],
    isSupported: true,
    entitlement: 'openSource',
  },
  paket: {
    manifestFiles: ['paket.dependencies'],
    isSupported: false,
    entitlement: 'openSource',
  },
  composer: {
    manifestFiles: ['composer.lock'],
    isSupported: true,
    entitlement: 'openSource',
  },
  cocoapods: {
    manifestFiles: ['Podfile'],
    isSupported: true,
    entitlement: 'openSource',
  },
  hex: {
    manifestFiles: ['mix.exs'],
    isSupported: false,
    entitlement: 'openSource',
  },
};

export const CONTAINER: {
  [projectType: string]: {
    manifestFiles: string[];
    isSupported: boolean;
    entitlement?: SnykProductEntitlement;
  };
} = {
  dockerfile: {
    isSupported: true,
    manifestFiles: [
      '*[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE]*',
      '*Dockerfile*',
    ],
    entitlement: 'dockerfileFromScm',
  },
};
export const CLOUD_CONFIGS: {
  [projectType: string]: {
    manifestFiles: string[];
    isSupported: boolean;
    entitlement?: SnykProductEntitlement;
  };
} = {
  helmconfig: {
    manifestFiles: ['templates/*.yaml', 'templates/*.yml', 'Chart.yaml'],
    isSupported: true,
    entitlement: 'infrastructureAsCode',
  },
  k8sconfig: {
    manifestFiles: ['*.yaml', '*.yml', '*.json'],
    isSupported: true,
    entitlement: 'infrastructureAsCode',
  },
  terraformconfig: {
    manifestFiles: ['*.tf'],
    isSupported: true,
    entitlement: 'infrastructureAsCode',
  },
};

export function getSCMSupportedManifests(
  manifestTypes: string[] = [],
  orgEntitlements: SnykProductEntitlement[] = ['openSource'],
): string[] {
  const typesWithSCMSupport = Object.entries({
    ...OPEN_SOURCE_PACKAGE_MANAGERS,
    ...CLOUD_CONFIGS,
    ...CONTAINER,
  }).filter(([, config]) => config.isSupported);

  const manifestFiles = typesWithSCMSupport.reduce(
    (manifests, [name, config]) => {
      if (manifestTypes.length > 0 && !manifestTypes.includes(name)) {
        return manifests;
      }

      if (config.entitlement && !orgEntitlements.includes(config.entitlement)) {
        return manifests;
      }

      config.manifestFiles.forEach((file) => manifests.add(file));

      return manifests;
    },
    new Set<string>(),
  );

  return Array.from(manifestFiles);
}

export function getSCMSupportedProjectTypes(
  orgEntitlements: SnykProductEntitlement[] = ['openSource'],
): string[] {
  const supported = [];
  const typesWithSCMSupport = Object.entries({
    ...OPEN_SOURCE_PACKAGE_MANAGERS,
    ...CLOUD_CONFIGS,
    ...CONTAINER,
  }).filter(([, config]) => config.isSupported);

  for (const [name, entry] of typesWithSCMSupport) {
    if (entry.entitlement && !orgEntitlements.includes(entry.entitlement)) {
      continue;
    }
    if (entry.isSupported) {
      supported.push(name);
    }
  }

  return supported;
}
