import { getSCMSupportedManifests } from '../../../src/lib';
import { getSCMSupportedProjectTypes } from '../../../src/lib/supported-project-types/supported-manifests';

test('SCM supported manifest files for importing & auto discovery', async () => {
  const supported = [
    'package.json',
    'Gemfile.lock',
    'yarn.lock',
    'pom.xml',
    'build.gradle',
    'build.sbt',
    '*req*.txt',
    'requirements/*.txt',
    'Gopkg.lock',
    'vendor.json',
    'go.mod',
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
    'composer.lock',
    'Podfile',
    '*[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE]*',
    '*Dockerfile*',
    'templates/*.yaml',
    'templates/*.yml',
    'Chart.yaml',
    '*.yaml',
    '*.yml',
    '*.json',
    '*.tf',
  ];

  expect(
    getSCMSupportedManifests(undefined, [
      'openSource',
      'infrastructureAsCode',
      'dockerfileFromScm',
    ]).sort(),
  ).toEqual(supported.sort());
});
test('SCM supported manifest files for importing & auto discovery', async () => {
  const supported = [
    'package.json',
    'Gemfile.lock',
    'yarn.lock',
    'pom.xml',
    'build.gradle',
    'build.sbt',
    '*req*.txt',
    'requirements/*.txt',
    'Gopkg.lock',
    'vendor.json',
    'go.mod',
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
    'composer.lock',
    'Podfile',
    '*[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE]*',
    '*Dockerfile*',
    'templates/*.yaml',
    'templates/*.yml',
    'Chart.yaml',
    '*.yaml',
    '*.yml',
    '*.json',
    '*.tf',
  ];

  expect(
    getSCMSupportedManifests(
      [],
      ['openSource', 'infrastructureAsCode', 'dockerfileFromScm'],
    ).sort(),
  ).toEqual(supported.sort());
});
test('SCM supported manifest files for specific project types', async () => {
  expect(getSCMSupportedManifests(['rubygems'])).toEqual(['Gemfile.lock']);
  expect(getSCMSupportedManifests(['npm', 'yarn'])).toEqual([
    'package.json',
    'yarn.lock',
  ]);

  expect(getSCMSupportedManifests(['pip', 'nuget'])).toEqual([
    '*req*.txt',
    'requirements/*.txt',
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
  ]);
  // Unsupported package manager requested
  expect(getSCMSupportedManifests(['golang'])).toEqual([]);
  expect(getSCMSupportedManifests(['unmanaged'])).toEqual([]);
  expect(
    getSCMSupportedManifests(['k8sconfig'], ['infrastructureAsCode']),
  ).toEqual(['*.yaml', '*.yml', '*.json']);
  expect(getSCMSupportedManifests(['k8sconfig'])).toEqual([]);
  expect(
    getSCMSupportedManifests(['helmconfig'], ['infrastructureAsCode']),
  ).toEqual(['templates/*.yaml', 'templates/*.yml', 'Chart.yaml']);
  expect(
    getSCMSupportedManifests(['terraformconfig'], ['infrastructureAsCode']),
  ).toEqual(['*.tf']);
  expect(
    getSCMSupportedManifests(['dockerfile'], ['dockerfileFromScm']),
  ).toEqual(['*[dD][oO][cC][kK][eE][rR][fF][iI][lL][eE]*', '*Dockerfile*']);
  expect(getSCMSupportedManifests(['dockerfile'])).toEqual([]);
});

test('SCM supported project types default', async () => {
  expect(getSCMSupportedProjectTypes().sort()).toEqual(
    [
      'npm',
      'rubygems',
      'yarn',
      'yarn-workspace',
      'maven',
      'gradle',
      'sbt',
      'pip',
      'golangdep',
      'govendor',
      'gomodules',
      'nuget',
      'composer',
      'cocoapods',
    ].sort(),
  );
});

test('SCM supported project types (OS & IAC & Docker)', async () => {
  expect(
    getSCMSupportedProjectTypes([
      'openSource',
      'dockerfileFromScm',
      'infrastructureAsCode',
    ]).sort(),
  ).toEqual(
    [
      'npm',
      'rubygems',
      'yarn',
      'yarn-workspace',
      'maven',
      'gradle',
      'sbt',
      'pip',
      'golangdep',
      'govendor',
      'gomodules',
      'nuget',
      'composer',
      'cocoapods',
      'dockerfile',
      'helmconfig',
      'k8sconfig',
      'terraformconfig',
    ].sort(),
  );
});
