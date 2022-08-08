export interface GitlabRepoData {
  fork: boolean;
  branch: string;
  id: number;
  name: string;
}

export interface GitlabGroupData {
  name: string;
  id: number;
  url: string;
}
