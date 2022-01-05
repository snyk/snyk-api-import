export interface repoListApiResponse {
  size: number;
  limit: number;
  isLastPage: boolean;
  start: number;
  nextPageStart?: number;
  values: unknown[];
}

export interface BitbucketServerRepoData {
  name: string;
  project: {
    key: string;
    name?: string;
  };
  public?: boolean;
}

export interface BitbucketServerProjectData {
  key: string;
  id: string;
  name: string;
}
