export interface SnykOrgData {
  name: string;
}

export interface GithubRepoData {
  fork: boolean;
  branch?: string;
  owner?: string;
  name: string;
}

export interface GithubOrgData {
  name: string;
  id: number;
  url: string;
}
