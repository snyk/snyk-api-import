package internal

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gitlab "gitlab.com/gitlab-org/api/client-go"
)

// Note: GetGitLabAuth tests exist in integration_auth_test.go

// mockGitLabClient implements GitLabClientInterface for testing
type mockGitLabClient struct {
	groups          []*gitlab.Group
	projects        map[string][]*gitlab.Project
	listGroupsErr   error
	listProjectsErr error
	nextPage        int
}

func (m *mockGitLabClient) ListGroups(opts *gitlab.ListGroupsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Group, *gitlab.Response, error) {
	if m.listGroupsErr != nil {
		return nil, nil, m.listGroupsErr
	}

	resp := &gitlab.Response{
		NextPage: m.nextPage,
	}

	return m.groups, resp, nil
}

func (m *mockGitLabClient) ListGroupProjects(gid interface{}, opts *gitlab.ListGroupProjectsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Project, *gitlab.Response, error) {
	if m.listProjectsErr != nil {
		return nil, nil, m.listProjectsErr
	}

	groupPath, ok := gid.(string)
	if !ok {
		return nil, nil, fmt.Errorf("invalid group ID type")
	}

	projects, exists := m.projects[groupPath]
	if !exists {
		projects = []*gitlab.Project{}
	}

	resp := &gitlab.Response{
		NextPage: m.nextPage,
	}

	return projects, resp, nil
}

func TestGitLabListGroupsWithClient_Success(t *testing.T) {
	mock := &mockGitLabClient{
		groups: []*gitlab.Group{
			{ID: 1, Name: "Group 1", FullPath: "group1", WebURL: "https://gitlab.com/group1"},
			{ID: 2, Name: "Group 2", FullPath: "group2", WebURL: "https://gitlab.com/group2"},
		},
	}

	groups, err := ListGitLabGroupsWithClient(context.Background(), mock)

	require.NoError(t, err)
	assert.Len(t, groups, 2)
	assert.Equal(t, 1, groups[0].ID)
	assert.Equal(t, "Group 1", groups[0].Name)
	assert.Equal(t, "group1", groups[0].FullPath)
}

func TestGitLabListGroupsWithClient_Pagination(t *testing.T) {
	// Create a stateful mock for pagination testing
	callCount := 0
	mock := &paginationMockGitLabClient{
		callCount: &callCount,
		page1Groups: []*gitlab.Group{
			{ID: 1, Name: "Group 1", FullPath: "group1"},
		},
		page2Groups: []*gitlab.Group{
			{ID: 2, Name: "Group 2", FullPath: "group2"},
		},
	}

	groups, err := ListGitLabGroupsWithClient(context.Background(), mock)

	require.NoError(t, err)
	assert.Len(t, groups, 2)
	assert.Equal(t, 2, callCount, "Should make 2 API calls for pagination")
}

// paginationMockGitLabClient is a specialized mock for testing pagination
type paginationMockGitLabClient struct {
	callCount   *int
	page1Groups []*gitlab.Group
	page2Groups []*gitlab.Group
}

func (m *paginationMockGitLabClient) ListGroups(opts *gitlab.ListGroupsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Group, *gitlab.Response, error) {
	*m.callCount++
	if *m.callCount == 1 {
		return m.page1Groups, &gitlab.Response{NextPage: 2}, nil
	}
	return m.page2Groups, &gitlab.Response{NextPage: 0}, nil
}

func (m *paginationMockGitLabClient) ListGroupProjects(gid interface{}, opts *gitlab.ListGroupProjectsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Project, *gitlab.Response, error) {
	return nil, &gitlab.Response{}, nil
}

func TestGitLabListGroupsWithClient_APIError(t *testing.T) {
	mock := &mockGitLabClient{
		listGroupsErr: fmt.Errorf("API error"),
	}

	_, err := ListGitLabGroupsWithClient(context.Background(), mock)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to list GitLab groups")
}

func TestGitLabListReposWithClient_Success(t *testing.T) {
	mock := &mockGitLabClient{
		projects: map[string][]*gitlab.Project{
			"test-group": {
				{
					ID:                1,
					Name:              "repo1",
					PathWithNamespace: "test-group/repo1",
					DefaultBranch:     "main",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
				{
					ID:                2,
					Name:              "repo2",
					PathWithNamespace: "test-group/repo2",
					DefaultBranch:     "master",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
			},
		},
	}

	repos, err := ListGitLabReposWithClient(context.Background(), mock, "test-group")

	require.NoError(t, err)
	assert.Len(t, repos, 2)
	assert.Equal(t, 1, repos[0].ID)
	assert.Equal(t, "repo1", repos[0].Name)
	assert.Equal(t, "test-group/repo1", repos[0].PathWithNamespace)
	assert.Equal(t, "main", repos[0].DefaultBranch)
}

func TestGitLabListReposWithClient_FiltersArchived(t *testing.T) {
	mock := &mockGitLabClient{
		projects: map[string][]*gitlab.Project{
			"test-group": {
				{
					ID:                1,
					Name:              "active-repo",
					PathWithNamespace: "test-group/active-repo",
					DefaultBranch:     "main",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
				{
					ID:                2,
					Name:              "archived-repo",
					PathWithNamespace: "test-group/archived-repo",
					DefaultBranch:     "main",
					Archived:          true,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
			},
		},
	}

	repos, err := ListGitLabReposWithClient(context.Background(), mock, "test-group")

	require.NoError(t, err)
	assert.Len(t, repos, 1)
	assert.Equal(t, "active-repo", repos[0].Name)
}

func TestGitLabListReposWithClient_FiltersNoDefaultBranch(t *testing.T) {
	mock := &mockGitLabClient{
		projects: map[string][]*gitlab.Project{
			"test-group": {
				{
					ID:                1,
					Name:              "repo-with-branch",
					PathWithNamespace: "test-group/repo-with-branch",
					DefaultBranch:     "main",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
				{
					ID:                2,
					Name:              "repo-no-branch",
					PathWithNamespace: "test-group/repo-no-branch",
					DefaultBranch:     "",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
			},
		},
	}

	repos, err := ListGitLabReposWithClient(context.Background(), mock, "test-group")

	require.NoError(t, err)
	assert.Len(t, repos, 1)
	assert.Equal(t, "repo-with-branch", repos[0].Name)
}

func TestGitLabListReposWithClient_EmptyGroupPath(t *testing.T) {
	mock := &mockGitLabClient{}

	_, err := ListGitLabReposWithClient(context.Background(), mock, "")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "groupPath is required")
}

func TestGitLabListReposWithClient_APIError(t *testing.T) {
	mock := &mockGitLabClient{
		listProjectsErr: fmt.Errorf("API error"),
	}

	_, err := ListGitLabReposWithClient(context.Background(), mock, "test-group")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to list projects")
}

func TestGitLabGroupIsEmptyWithClient_True(t *testing.T) {
	mock := &mockGitLabClient{
		projects: map[string][]*gitlab.Project{
			"empty-group": {},
		},
	}

	isEmpty, err := GitLabGroupIsEmptyWithClient(context.Background(), mock, "empty-group")

	require.NoError(t, err)
	assert.True(t, isEmpty)
}

func TestGitLabGroupIsEmptyWithClient_False(t *testing.T) {
	mock := &mockGitLabClient{
		projects: map[string][]*gitlab.Project{
			"test-group": {
				{
					ID:                1,
					Name:              "repo1",
					PathWithNamespace: "test-group/repo1",
					DefaultBranch:     "main",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
			},
		},
	}

	isEmpty, err := GitLabGroupIsEmptyWithClient(context.Background(), mock, "test-group")

	require.NoError(t, err)
	assert.False(t, isEmpty)
}

func TestGitLabGroupIsEmptyWithClient_IgnoresArchivedAndNoBranch(t *testing.T) {
	mock := &mockGitLabClient{
		projects: map[string][]*gitlab.Project{
			"test-group": {
				{
					ID:                1,
					Name:              "archived",
					PathWithNamespace: "test-group/archived",
					DefaultBranch:     "main",
					Archived:          true,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
				{
					ID:                2,
					Name:              "no-branch",
					PathWithNamespace: "test-group/no-branch",
					DefaultBranch:     "",
					Archived:          false,
					Namespace:         &gitlab.ProjectNamespace{FullPath: "test-group"},
				},
			},
		},
	}

	isEmpty, err := GitLabGroupIsEmptyWithClient(context.Background(), mock, "test-group")

	require.NoError(t, err)
	assert.True(t, isEmpty, "Group should be empty when only archived/no-branch projects exist")
}

func TestGitLabGroupIsEmptyWithClient_EmptyGroupPath(t *testing.T) {
	mock := &mockGitLabClient{}

	_, err := GitLabGroupIsEmptyWithClient(context.Background(), mock, "")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "groupPath is required")
}

func TestNewGitLabClientWrapper_Success(t *testing.T) {
	auth := &GitLabAuth{
		Token:   "test-token",
		BaseURL: "https://gitlab.com",
	}

	client, err := NewGitLabClientWrapper(auth)

	require.NoError(t, err)
	assert.NotNil(t, client)
}

func TestNewGitLabClientWrapper_MissingToken(t *testing.T) {
	auth := &GitLabAuth{
		BaseURL: "https://gitlab.com",
	}

	_, err := NewGitLabClientWrapper(auth)

	assert.Error(t, err)
	assert.Equal(t, ErrMissingToken, err)
}

func TestNewGitLabClientWrapper_CustomBaseURL(t *testing.T) {
	auth := &GitLabAuth{
		Token:   "test-token",
		BaseURL: "https://gitlab.custom.com",
	}

	client, err := NewGitLabClientWrapper(auth)

	require.NoError(t, err)
	assert.NotNil(t, client)
}
