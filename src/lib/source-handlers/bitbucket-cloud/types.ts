export interface BitbucketCloudWorkspaceData {
  uuid: string;
  slug: string;
  is_private: boolean;
  name: string;
}

export interface BitbucketCloudRepoData {
  slug: string;
  workspace: {
    uuid: string;
    slug?: string;
  };
  mainbranch?: {
    name: string;
  };
  is_private?: boolean;
}
