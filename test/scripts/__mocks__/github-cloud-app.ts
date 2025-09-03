/* eslint-disable @typescript-eslint/naming-convention */
// Mock for GitHub Cloud App authentication and API calls
export const mockGitHubAppToken = 'mock-github-app-token';
export const mockInstallationId = 12345;

export const mockInstallations = [
  {
    id: mockInstallationId,
    account: {
      id: 1,
      login: 'test-org',
      type: 'Organization' as const,
      url: 'https://api.github.com/orgs/test-org',
    },
    repository_selection: 'all' as const,
    access_tokens_url:
      'https://api.github.com/app/installations/12345/access_tokens',
    repositories_url: 'https://api.github.com/installation/repositories',
    html_url: 'https://github.com/settings/installations/12345',
    app_id: 123456,
    app_slug: 'test-app',
    target_id: 1,
    target_type: 'Organization',
    permissions: {
      contents: 'read',
      metadata: 'read',
      pull_requests: 'read',
      issues: 'read',
    },
    events: ['push', 'pull_request'],
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    single_file_name: null,
    has_multiple_single_files: false,
    single_file_paths: [],
    suspended_by: null,
    suspended_at: null,
  },
];

export const mockRepositories = [
  {
    id: 1,
    name: 'test-repo',
    full_name: 'test-org/test-repo',
    owner: {
      login: 'test-org',
      id: 1,
      type: 'Organization',
    },
    private: false,
    html_url: 'https://github.com/test-org/test-repo',
    description: 'Test repository',
    fork: false,
    url: 'https://api.github.com/repos/test-org/test-repo',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    pushed_at: '2023-01-01T00:00:00Z',
    clone_url: 'https://github.com/test-org/test-repo.git',
    ssh_url: 'git@github.com:test-org/test-repo.git',
    default_branch: 'main',
    archived: false,
  },
  {
    id: 2,
    name: 'another-repo',
    full_name: 'test-org/another-repo',
    owner: {
      login: 'test-org',
      id: 1,
      type: 'Organization',
    },
    private: true,
    html_url: 'https://github.com/test-org/another-repo',
    description: 'Another test repository',
    fork: true,
    url: 'https://api.github.com/repos/test-org/another-repo',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    pushed_at: '2023-01-01T00:00:00Z',
    clone_url: 'https://github.com/test-org/another-repo.git',
    ssh_url: 'git@github.com:test-org/another-repo.git',
    default_branch: 'master',
    archived: false,
  },
];

export const mockRepositoryMetadata = {
  id: 1,
  name: 'test-repo',
  full_name: 'test-org/test-repo',
  owner: {
    login: 'test-org',
    id: 1,
    type: 'Organization',
  },
  private: false,
  html_url: 'https://github.com/test-org/test-repo',
  description: 'Test repository',
  fork: false,
  url: 'https://api.github.com/repos/test-org/test-repo',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  pushed_at: '2023-01-01T00:00:00Z',
  clone_url: 'https://github.com/test-org/test-repo.git',
  ssh_url: 'git@github.com:test-org/test-repo.git',
  default_branch: 'main',
  archived: false,
};
