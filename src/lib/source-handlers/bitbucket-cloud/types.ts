export interface BitbucketCloudWorkspaceData {
  uuid: string;
  slug: string;
  name: string;
}

export interface BitbucketCloudRepoData {
  owner: string;
  name: string;
  branch: string;
}

export interface BitbucketCloudProjectData {
  key: string;
  uuid: string;
  name: string;
}
