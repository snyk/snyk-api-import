export interface GitHubCloudAppOrgData {
  name: string;
}

export interface GitHubCloudAppRepoData {
  fork: boolean;
  branch?: string;
  owner?: string;
  name: string;
}

export interface GitHubCloudAppOrgInfo {
  name: string;
  id: number;
  url: string;
}

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  installationId?: string;
}

export interface GitHubInstallation {
  id: number;
  account: {
    id: number;
    login: string;
    type: 'User' | 'Organization';
    url: string;
  } | null;
  repository_selection: 'all' | 'selected';
  access_tokens_url: string;
  repositories_url: string;
  html_url: string;
  app_id: number;
  app_slug: string;
  target_id: number;
  target_type: string;
  permissions: Record<string, string>;
  events: string[];
  created_at: string;
  updated_at: string;
  single_file_name: string | null;
  has_multiple_single_files: boolean;
  single_file_paths: string[];
  suspended_by: any;
  suspended_at: string | null;
}
