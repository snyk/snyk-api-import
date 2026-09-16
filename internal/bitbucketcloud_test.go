package internal

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Note: GetBitbucketCloudAuth tests exist in integration_auth_test.go
// Mock Bitbucket client for testing
type mockBitbucketClient struct {
	workspaces    []map[string]interface{}
	repositories  []map[string]interface{}
	defaultBranch string
	err           error
}

func (m *mockBitbucketClient) FetchWorkspaces(ctx context.Context) ([]map[string]interface{}, error) {
	return m.workspaces, m.err
}

func (m *mockBitbucketClient) FetchRepositories(ctx context.Context, workspace string) ([]map[string]interface{}, error) {
	return m.repositories, m.err
}

func (m *mockBitbucketClient) FetchDefaultBranch(ctx context.Context, workspace, repoSlug string) (string, error) {
	return m.defaultBranch, m.err
}

func TestBitbucketFetchWorkspaces_Success(t *testing.T) {
	mockClient := &mockBitbucketClient{
		workspaces: []map[string]interface{}{
			{"slug": "workspace1", "name": "Workspace 1"},
			{"slug": "workspace2", "name": "Workspace 2"},
		},
	}

	workspaces, err := FetchBitbucketCloudWorkspacesWithClient(context.Background(), mockClient)

	assert.NoError(t, err)
	assert.Len(t, workspaces, 2)
	assert.Equal(t, "workspace1", workspaces[0])
	assert.Equal(t, "workspace2", workspaces[1])
}

func TestBitbucketFetchWorkspaces_Error(t *testing.T) {
	mockClient := &mockBitbucketClient{
		err: fmt.Errorf("API error"),
	}

	workspaces, err := FetchBitbucketCloudWorkspacesWithClient(context.Background(), mockClient)

	assert.Error(t, err)
	assert.Nil(t, workspaces)
}

func TestBitbucketFetchWorkspaces_NilClient(t *testing.T) {
	workspaces, err := FetchBitbucketCloudWorkspacesWithClient(context.Background(), nil)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "client is required")
	assert.Nil(t, workspaces)
}

func TestBitbucketFetchDefaultBranch_Success(t *testing.T) {
	mockClient := &mockBitbucketClient{
		defaultBranch: "main",
	}

	branch, err := FetchBitbucketCloudRepoDefaultBranchWithClient(context.Background(), mockClient, "workspace1", "repo1")

	assert.NoError(t, err)
	assert.Equal(t, "main", branch)
}

func TestBitbucketFetchDefaultBranch_Error(t *testing.T) {
	mockClient := &mockBitbucketClient{
		err: fmt.Errorf("repo not found"),
	}

	branch, err := FetchBitbucketCloudRepoDefaultBranchWithClient(context.Background(), mockClient, "workspace1", "repo1")

	assert.Error(t, err)
	assert.Empty(t, branch)
}

func TestBitbucketFetchDefaultBranch_NilClient(t *testing.T) {
	branch, err := FetchBitbucketCloudRepoDefaultBranchWithClient(context.Background(), nil, "workspace1", "repo1")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "client is required")
	assert.Empty(t, branch)
}

// Test helper functions that don't require API calls

func TestBitbucketAuthMethod_Basic(t *testing.T) {
	auth := &BitbucketCloudAuth{
		Username: "test-user",
		Password: "test-pass",
		Method:   "basic",
	}

	req, _ := http.NewRequest("GET", "https://api.bitbucket.org", nil)
	auth.SetAuthHeader(req)

	// Verify Basic Auth header is set
	authHeader := req.Header.Get("Authorization")
	assert.NotEmpty(t, authHeader)
	assert.Contains(t, authHeader, "Basic")
}

func TestBitbucketAuthMethod_AppPassword(t *testing.T) {
	// App passwords use "basic" method with username:password credentials
	auth := &BitbucketCloudAuth{
		Username: "test-user",
		Password: "app-password",
		Method:   "basic", // App passwords use basic auth
	}

	req, _ := http.NewRequest("GET", "https://api.bitbucket.org", nil)
	auth.SetAuthHeader(req)

	// Verify Basic Auth header is set (app password uses Basic Auth with username:password)
	authHeader := req.Header.Get("Authorization")
	assert.NotEmpty(t, authHeader)
	assert.Contains(t, authHeader, "Basic")
}

func TestBitbucketAuthMethod_Token(t *testing.T) {
	auth := &BitbucketCloudAuth{
		Token:  "test-token-123",
		Method: "token",
	}

	req, _ := http.NewRequest("GET", "https://api.bitbucket.org", nil)
	auth.SetAuthHeader(req)

	// Verify Bearer token header is set
	authHeader := req.Header.Get("Authorization")
	assert.NotEmpty(t, authHeader)
	assert.Contains(t, authHeader, "Bearer")
	assert.Contains(t, authHeader, "test-token-123")
}

func TestBitbucketAuthMethod_OAuth(t *testing.T) {
	auth := &BitbucketCloudAuth{
		Token:  "oauth-token-xyz",
		Method: "oauth",
	}

	req, _ := http.NewRequest("GET", "https://api.bitbucket.org", nil)
	auth.SetAuthHeader(req)

	// Verify Bearer token header is set (OAuth uses Bearer)
	authHeader := req.Header.Get("Authorization")
	assert.NotEmpty(t, authHeader)
	assert.Contains(t, authHeader, "Bearer")
	assert.Contains(t, authHeader, "oauth-token-xyz")
}

func TestBitbucketRepoStruct(t *testing.T) {
	// Test that Repo struct can be created and used
	repo := Repo{
		Name:     "Test Repository",
		FullName: "test-org/test-repo",
		UUID:     "uuid-123",
		Branch:   "main",
	}
	repo.Owner.DisplayName = "Test Org"
	repo.Owner.UUID = "org-uuid-456"

	assert.Equal(t, "Test Repository", repo.Name)
	assert.Equal(t, "test-org/test-repo", repo.FullName)
	assert.Equal(t, "uuid-123", repo.UUID)
	assert.Equal(t, "main", repo.Branch)
	assert.Equal(t, "Test Org", repo.Owner.DisplayName)
	assert.Equal(t, "org-uuid-456", repo.Owner.UUID)
}

// Note: Full Bitbucket API testing would require refactoring similar to GitLab/GitHub
// to use dependency injection with an interface. The functions currently use hardcoded
// https://api.bitbucket.org URLs which cannot be easily mocked.
//
// Functions that still use hardcoded API URLs and may benefit from further
// dependency-injection refactoring for full testability:
// - FetchRepos
