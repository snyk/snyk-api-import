package internal

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/go-github/v57/github"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Note: GetGitHubAuth tests exist in integration_auth_test.go

// mockGitHubClient implements GitHubClientInterface for testing
type mockGitHubClient struct {
	orgs           []*github.Organization
	allOrgs        []*github.Organization
	repos          map[string][]*github.Repository
	listOrgsErr    error
	listAllOrgsErr error
	listReposErr   error
	nextPage       int
}

func (m *mockGitHubClient) ListOrganizations(ctx context.Context, user string, opts *github.ListOptions) ([]*github.Organization, *github.Response, error) {
	if m.listOrgsErr != nil {
		return nil, nil, m.listOrgsErr
	}

	resp := &github.Response{
		NextPage: m.nextPage,
	}

	return m.orgs, resp, nil
}

func (m *mockGitHubClient) ListAllOrganizations(ctx context.Context, opts *github.OrganizationsListOptions) ([]*github.Organization, *github.Response, error) {
	if m.listAllOrgsErr != nil {
		return nil, nil, m.listAllOrgsErr
	}

	resp := &github.Response{
		NextPage: m.nextPage,
	}

	return m.allOrgs, resp, nil
}

func (m *mockGitHubClient) ListRepositories(ctx context.Context, org string, opts *github.RepositoryListByOrgOptions) ([]*github.Repository, *github.Response, error) {
	if m.listReposErr != nil {
		return nil, nil, m.listReposErr
	}

	repos, exists := m.repos[org]
	if !exists {
		repos = []*github.Repository{}
	}

	resp := &github.Response{
		NextPage: m.nextPage,
	}

	return repos, resp, nil
}

func TestGitHubFetchOrgsWithClient_Success_GitHubCom(t *testing.T) {
	login1 := "org1"
	login2 := "org2"
	id1 := int64(1)
	id2 := int64(2)
	url1 := "https://api.github.com/orgs/org1"
	url2 := "https://api.github.com/orgs/org2"

	mock := &mockGitHubClient{
		orgs: []*github.Organization{
			{Login: &login1, ID: &id1, URL: &url1},
			{Login: &login2, ID: &id2, URL: &url2},
		},
	}

	orgs, err := FetchGitHubOrgsWithClient(context.Background(), mock, "https://api.github.com")

	require.NoError(t, err)
	assert.Len(t, orgs, 2)
	assert.Equal(t, "org1", orgs[0].Name)
	assert.Equal(t, int64(1), orgs[0].ID)
	assert.Equal(t, "https://api.github.com/orgs/org1", orgs[0].URL)
}

func TestGitHubFetchOrgsWithClient_Success_Enterprise(t *testing.T) {
	login1 := "enterprise-org"
	id1 := int64(100)

	mock := &mockGitHubClient{
		allOrgs: []*github.Organization{
			{Login: &login1, ID: &id1},
		},
	}

	orgs, err := FetchGitHubOrgsWithClient(context.Background(), mock, "https://github.company.com")

	require.NoError(t, err)
	assert.Len(t, orgs, 1)
	assert.Equal(t, "enterprise-org", orgs[0].Name)
	assert.Equal(t, int64(100), orgs[0].ID)
}

func TestGitHubFetchOrgsWithClient_Pagination(t *testing.T) {
	// Create a stateful mock for pagination testing
	callCount := 0
	mock := &paginationMockGitHubClient{
		callCount: &callCount,
		page1Orgs: []*github.Organization{
			{Login: stringPtr("org1"), ID: int64Ptr(1)},
		},
		page2Orgs: []*github.Organization{
			{Login: stringPtr("org2"), ID: int64Ptr(2)},
		},
	}

	orgs, err := FetchGitHubOrgsWithClient(context.Background(), mock, "https://api.github.com")

	require.NoError(t, err)
	assert.Len(t, orgs, 2)
	assert.Equal(t, 2, callCount, "Should make 2 API calls for pagination")
}

// paginationMockGitHubClient is a specialized mock for testing pagination
type paginationMockGitHubClient struct {
	callCount *int
	page1Orgs []*github.Organization
	page2Orgs []*github.Organization
}

func (m *paginationMockGitHubClient) ListOrganizations(ctx context.Context, user string, opts *github.ListOptions) ([]*github.Organization, *github.Response, error) {
	*m.callCount++
	if *m.callCount == 1 {
		return m.page1Orgs, &github.Response{NextPage: 2}, nil
	}
	return m.page2Orgs, &github.Response{NextPage: 0}, nil
}

func (m *paginationMockGitHubClient) ListAllOrganizations(ctx context.Context, opts *github.OrganizationsListOptions) ([]*github.Organization, *github.Response, error) {
	// Not used in pagination test
	return nil, &github.Response{}, nil
}

func (m *paginationMockGitHubClient) ListRepositories(ctx context.Context, org string, opts *github.RepositoryListByOrgOptions) ([]*github.Repository, *github.Response, error) {
	// Not used in pagination test
	return nil, &github.Response{}, nil
}

func TestGitHubFetchOrgsWithClient_FiltersNilData(t *testing.T) {
	login := "valid-org"
	id := int64(1)

	mock := &mockGitHubClient{
		orgs: []*github.Organization{
			{Login: &login, ID: &id},
			{Login: nil, ID: &id},    // Missing login
			{Login: &login, ID: nil}, // Missing ID
		},
	}

	orgs, err := FetchGitHubOrgsWithClient(context.Background(), mock, "https://api.github.com")

	require.NoError(t, err)
	assert.Len(t, orgs, 1, "Should filter out orgs with nil Login or ID")
	assert.Equal(t, "valid-org", orgs[0].Name)
}

func TestGitHubFetchOrgsWithClient_APIError(t *testing.T) {
	mock := &mockGitHubClient{
		listOrgsErr: fmt.Errorf("API error"),
	}

	_, err := FetchGitHubOrgsWithClient(context.Background(), mock, "https://api.github.com")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "list organizations")
}

func TestGitHubFetchReposWithClient_Success(t *testing.T) {
	name1 := "repo1"
	name2 := "repo2"
	owner := "test-org"
	branch1 := "main"
	branch2 := "develop"
	archived := false

	mock := &mockGitHubClient{
		repos: map[string][]*github.Repository{
			"test-org": {
				{
					Name:          &name1,
					Owner:         &github.User{Login: &owner},
					DefaultBranch: &branch1,
					Archived:      &archived,
				},
				{
					Name:          &name2,
					Owner:         &github.User{Login: &owner},
					DefaultBranch: &branch2,
					Archived:      &archived,
				},
			},
		},
	}

	repos, err := FetchGitHubReposWithClient(context.Background(), mock, "test-org")

	require.NoError(t, err)
	assert.Len(t, repos, 2)
	assert.Equal(t, "repo1", repos[0]["name"])
	assert.Equal(t, "test-org", repos[0]["owner"])
	assert.Equal(t, "main", repos[0]["branch"])
}

func TestGitHubFetchReposWithClient_FiltersArchived(t *testing.T) {
	name1 := "active-repo"
	name2 := "archived-repo"
	owner := "test-org"
	branch := "main"
	archived1 := false
	archived2 := true

	mock := &mockGitHubClient{
		repos: map[string][]*github.Repository{
			"test-org": {
				{
					Name:          &name1,
					Owner:         &github.User{Login: &owner},
					DefaultBranch: &branch,
					Archived:      &archived1,
				},
				{
					Name:          &name2,
					Owner:         &github.User{Login: &owner},
					DefaultBranch: &branch,
					Archived:      &archived2,
				},
			},
		},
	}

	repos, err := FetchGitHubReposWithClient(context.Background(), mock, "test-org")

	require.NoError(t, err)
	assert.Len(t, repos, 1)
	assert.Equal(t, "active-repo", repos[0]["name"])
}

func TestGitHubFetchReposWithClient_EmptyOrgName(t *testing.T) {
	mock := &mockGitHubClient{}

	_, err := FetchGitHubReposWithClient(context.Background(), mock, "")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "orgName is required")
}

func TestGitHubFetchReposWithClient_APIError(t *testing.T) {
	mock := &mockGitHubClient{
		listReposErr: fmt.Errorf("API error"),
	}

	_, err := FetchGitHubReposWithClient(context.Background(), mock, "test-org")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "list repositories")
}

func TestNewGitHubClientWrapper_Success(t *testing.T) {
	auth := GitHubAuth{
		Token:   "test-token",
		BaseURL: "https://api.github.com",
	}

	client, err := NewGitHubClientWrapper(context.Background(), auth)

	require.NoError(t, err)
	assert.NotNil(t, client)
}

func TestNewGitHubClientWrapper_MissingToken(t *testing.T) {
	auth := GitHubAuth{
		BaseURL: "https://api.github.com",
	}

	_, err := NewGitHubClientWrapper(context.Background(), auth)

	assert.Error(t, err)
	assert.Equal(t, ErrGitHubMissingToken, err)
}

func TestNewGitHubClientWrapper_EnterpriseURL(t *testing.T) {
	auth := GitHubAuth{
		Token:   "test-token",
		BaseURL: "https://github.company.com",
	}

	client, err := NewGitHubClientWrapper(context.Background(), auth)

	require.NoError(t, err)
	assert.NotNil(t, client)
}

// Helper function for creating int64 pointers
func int64Ptr(i int64) *int64 {
	return &i
}
