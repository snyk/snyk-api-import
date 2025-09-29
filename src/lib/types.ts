import type { SnykProductEntitlement } from './supported-project-types/supported-manifests';

export interface ImportTarget {
  orgId: string;
  integrationId: string;
  target: Target;
  files?: FilePath[];
  exclusionGlobs?: string;
}

export interface CreatedOrg {
  name: string;
  created?: string;
  integrations: {
    [name: string]: string;
  };
  orgId: string;
  groupId: string;
  origName: string; // name requested to be created
  sourceOrgId?: string;
}

// also must update targetProps if any new props are added
export interface Target {
  name?: string; // GitHub, GH Enterprise, Bitbucket Cloud and Azure Repos, Bitbucket Server, Azure Container Registry, Elastic Container Registry, Artifactory Container Registry, Docker Hub
  appId?: string; // Heroku, CloudFoundry, Pivotal & IBM Cloud
  functionId?: string; // AWS Labmda
  slugId?: string; // Heroku
  projectKey?: string; // Bitbucket Server
  repoSlug?: string; // Bitbucket Server
  id?: number; // Gitlab
  owner?: string; // GitHub, GH Enterprise, Bitbucket Cloud and Azure Repos
  // if not set default branch will be picked
  branch?: string; // Gitlab, GitHub, GH Enterprise, Bitbucket Cloud and Azure Repos
}

export interface FilePath {
  path: string;
}

export interface CreateOrgData {
  groupId: string;
  name: string;
  sourceOrgId?: string;
}

export enum Status {
  PENDING = 'pending',
  FAILED = 'failed',
  COMPLETE = 'complete',
}

export interface Project {
  targetFile?: string;
  success: boolean;
  projectUrl: string;
  // TODO: would be nice to add?
  // projectId: string;
}

export interface Log {
  name: string;
  created: string;
  status: Status;
  projects: Project[];
}

export interface PollImportResponse {
  id: string;
  status: 'pending' | 'failed' | 'complete';
  created: string;
  logs: Log[];
}

// used to generate import data by connecting to the source via API
// and listing all repos / targets per given org
export enum SupportedIntegrationTypesImportData {
  GITHUB = 'github',
  GITHUB_CLOUD_APP = 'github-cloud-app',
  GHE = 'github-enterprise',
  GITLAB = 'gitlab',
  AZURE_REPOS = 'azure-repos',
  BITBUCKET_SERVER = 'bitbucket-server',
  BITBUCKET_CLOUD = 'bitbucket-cloud',
}

// used to generate import data by connecting to the source via API
// and listing all orgs
export enum SupportedIntegrationTypesImportOrgData {
  GITHUB = 'github',
  GITHUB_CLOUD_APP = 'github-cloud-app',
  GHE = 'github-enterprise',
  GITLAB = 'gitlab',
  BITBUCKET_SERVER = 'bitbucket-server',
  BITBUCKET_CLOUD = 'bitbucket-cloud',
}

export enum SupportedIntegrationTypesUpdateProject {
  GITHUB = 'github',
  GITHUB_CLOUD_APP = 'github-cloud-app',
  GHE = 'github-enterprise',
}

export enum SupportedProductsUpdateProject {
  CONTAINER = 'container',
  OPEN_SOURCE = 'open-source',
  IAC = 'iac',
}

export const productEntitlements: {
  [key in SupportedProductsUpdateProject]: SnykProductEntitlement;
} = {
  [SupportedProductsUpdateProject.IAC]: 'infrastructureAsCode',
  [SupportedProductsUpdateProject.OPEN_SOURCE]: 'openSource',
  [SupportedProductsUpdateProject.CONTAINER]: 'dockerfileFromScm',
};
// used to generate imported targets that exist in Snyk
// when we need to grab the integrationId from Snyk
export enum SupportedIntegrationTypesToListSnykTargets {
  GITHUB = 'github',
  GITHUB_CLOUD_APP = 'github-cloud-app',
  GHE = 'github-enterprise',
  BITBUCKET_CLOUD = 'bitbucket-cloud',
  GCR = 'gcr',
  DOCKER_HUB = 'docker-hub',
  GITLAB = 'gitlab',
  AZURE_REPOS = 'azure-repos',
  BITBUCKET_SERVER = 'bitbucket-server',
}

export interface CommandResult {
  fileName: string | undefined;
  exitCode: number;
  message: string | undefined;
}

export interface SnykProject {
  name: string;
  id: string;
  created: string;
  origin: string;
  type: string;
  branch: string | null;
  status: 'inactive' | 'active';
}

export interface Org {
  name: string;
  id: string;
  slug: string;
  url: string;
  group: {
    name: string;
    id: string;
  };
}

export interface RESTProjectData {
  attributes: RESTProjectsAttributes;
  id: string;
  relationships: RESTProjectsRelationships;
  type: string;
}

export interface RESTProjectsAttributes {
  businessCriticality: string;
  created: string;
  environment: string;
  lifecycle: string;
  name: string;
  origin: string;
  status: 'inactive' | 'active';
  tags: unknown;
  targetReference: string | null;
  type: string;
}

export interface RESTProjectsRelationships {
  importingUser: RESTProjectsRelashionshipData;
  org: RESTProjectsRelashionshipData;
  owner: RESTProjectsRelashionshipData;
  target: RESTProjectsRelashionshipData;
}

export interface RESTProjectsRelashionshipData {
  data: {
    id: string;
    type: string;
  };
  links: {
    first?: string;
    last?: string;
    next?: string;
    prev?: string;
    related?: string;
    self?: string;
  };
  meta: unknown;
}

export interface SnykTargetRelationships {
  org: {
    data: {
      id: string;
      type: string;
    };
    links: {
      first?: string;
      last?: string;
      next?: string;
      prev?: string;
      related?: string;
      self?: string;
    };
    meta: unknown;
  };
}

export interface RepoMetaData {
  branch: string;
  cloneUrl: string;
  sshUrl: string;
  archived: boolean;
}

export interface SnykTarget {
  attributes: {
    displayName: string;
    isPrivate: boolean;
    origin: string;
    remoteUrl: string | null;
  };
  id: string;
  relationships: SnykTargetRelationships;
  type: string;
}

export interface RESTTargetResponse {
  data: SnykTarget[];
  jsonapi: {
    version: string;
  };
  links: {
    first?: string;
    last?: string;
    next?: string;
    prev?: string;
    related?: string;
    self?: string;
  };
}

export type SyncTargetsConfig = {
  dryRun: boolean;
  entitlements?: SnykProductEntitlement[];
  manifestTypes?: string[];
  exclusionGlobs?: string[];
};

export enum ProjectUpdateType {
  BRANCH = 'branch',
  DEACTIVATE = 'deactivate',
  IMPORT = 'import',
}
