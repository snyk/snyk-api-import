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
  GHE = 'github-enterprise',
  GITLAB = 'gitlab',
  BITBUCKET_SERVER = 'bitbucket-server',
  BITBUCKET_CLOUD = 'bitbucket-cloud',
}

// used to generate imported targets that exist in Snyk
// when we need to grab the integrationId from Snyk
export enum SupportedIntegrationTypesToListSnykTargets {
  GITHUB = 'github',
  GHE = 'github-enterprise',
  BITBUCKET_CLOUD = 'bitbucket-cloud',
  GCR = 'gcr',
  DOCKER_HUB = 'docker-hub',
  GITLAB = 'gitlab',
  AZURE_REPOS = 'azure-repos',
  BITBUCKET_SERVER = 'bitbucket-server',
}
interface ImportingUser {
  id: string;
  name: string;
  username: string;
  email: string;
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
  lastTestedDate: string;
  testFrequency: string;
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


export interface v3ProjectData {
  attributes: v3ProjectsAttributes;
  id: string;
  relationships: v3ProjectsRelationships;
  type: string
}

export interface v3ProjectsAttributes {
  businessCriticality: string;
  created: string;
  environment: string;
  lifecycle: string;
  name: string;
  origin: string;
  status: string;
  tags: unknown;
  targetReference: string | null;
  type: string;
  lastTestedDate: string;
  testFrequency: string;
}

export interface v3ProjectsRelationships {
  importingUser: v3ProjectsRelashionshipData;
  org: v3ProjectsRelashionshipData;
  owner: v3ProjectsRelashionshipData;
  target: v3ProjectsRelashionshipData;
}

export interface v3ProjectsRelashionshipData {
  data: {
    id: string;
    type: string;
  }
  links: unknown;
  meta: unknown;
}
