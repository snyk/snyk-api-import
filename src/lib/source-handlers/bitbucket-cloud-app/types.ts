export interface BitbucketCloudAppConfig {
  clientId: string;
  clientSecret: string;
  apiBase?: string;
}

export interface BitbucketWorkspace {
  uuid: string;
  name: string;
  slug: string;
}

export interface BitbucketRepoData {
  fork: boolean;
  name: string;
  // Keep the Bitbucket API field name here to match the upstream payload
  // (Bitbucket returns `full_name`). We intentionally preserve the
  // underscore style to make mapping trivial and avoid extra transform logic.

  full_name?: string;
  owner?: string;
  branch?: string;
}
