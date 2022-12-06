export type SnykProductEntitlement =
  | 'dockerfileFromScm'
  | 'infrastructureAsCode';

export const OPEN_SOURCE_PACKAGE_MANAGERS: {
  [projectType: string]: {
    manifestFiles: string[];
    isSupported: boolean;
    entitlement?: SnykProductEntitlement;
  };
} = {
  npm: {
    manifestFiles: ['package.json'],
    isSupported: true,
  },
  rubygems: {
    manifestFiles: ['Gemfile.lock'],
    isSupported: true,
  },
  yarn: {
    manifestFiles: ['yarn.lock'],
    isSupported: true,
  },
  'yarn-workspace': {
    manifestFiles: ['yarn.lock'],
    isSupported: true,
  },
  maven: {
    manifestFiles: ['pom.xml'],
    isSupported: true,
  },
  gradle: {
    manifestFiles: ['build.gradle'],
    isSupported: true,
  },
  sbt: {
    manifestFiles: ['build.sbt'],
    isSupported: true,
  },
  pip: {
    manifestFiles: ['*req*.txt', 'requirements/*.txt'],
    isSupported: true,
  },
  poetry: {
    manifestFiles: ['pyproject.toml'],
    isSupported: false,
  },
  golangdep: {
    manifestFiles: ['Gopkg.lock'],
    isSupported: true,
  },
  govendor: {
    manifestFiles: ['vendor.json'],
    isSupported: true,
  },
  gomodules: {
    manifestFiles: ['go.mod'],
    isSupported: true,
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
  },
  paket: {
    manifestFiles: ['paket.dependencies'],
    isSupported: false,
  },
  composer: {
    manifestFiles: ['composer.lock'],
    isSupported: true,
  },
  cocoapods: {
    manifestFiles: ['Podfile'],
    isSupported: true,
  },
  hex: {
    manifestFiles: ['mix.exs'],
    isSupported: false,
  },
};

export const DOCKER: {
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
  manifestTypes?: string[],
  orgEntitlements: SnykProductEntitlement[] = [],
): string[] {
  const typesWithSCMSupport = Object.entries({
    ...OPEN_SOURCE_PACKAGE_MANAGERS,
    ...CLOUD_CONFIGS,
    ...DOCKER,
  }).filter(([, config]) => config.isSupported);

  const manifestFiles = typesWithSCMSupport.reduce(
    (manifests, [name, config]) => {
      if (manifestTypes && !manifestTypes.includes(name)) {
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

export function getSCMSupportedProjectTypes(): string[] {
  const supported = [];

  for (const [name, entry] of Object.entries({
    ...OPEN_SOURCE_PACKAGE_MANAGERS,
    ...CLOUD_CONFIGS,
    ...DOCKER,
  })) {
    if (entry.isSupported) {
      supported.push(name);
    }
  }

  return supported;
}
