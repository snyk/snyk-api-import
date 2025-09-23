// Unified Bitbucket Cloud authentication config
export type BitbucketCloudAuthConfig =
  | { type: 'user'; username: string; password: string }
  | { type: 'app'; clientId: string; clientSecret: string };
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
