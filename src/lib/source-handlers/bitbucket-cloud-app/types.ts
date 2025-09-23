// Types for Bitbucket Cloud App integration
export interface BitbucketCloudAppOrgData {
  uuid: string;
  name: string;
  workspace: string;
}

export interface BitbucketCloudAppRepoData {
  uuid: string;
  name: string;
  workspace: string;
  isPrivate: boolean;
  mainbranch?: string;
}

export interface BitbucketCloudAppOrgInfo {
  uuid: string;
  name: string;
  workspace: string;
  repos: BitbucketCloudAppRepoData[];
}

export interface BitbucketAppConfig {
  clientId: string;
  clientSecret: string;
  workspace?: string;
  installationId?: string;
}

export interface BitbucketInstallation {
  uuid: string;
  workspace: string;
}
