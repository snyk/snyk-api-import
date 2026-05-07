package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/snyk/snyk-api-import/internal/network"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Note: GetAzureAuth tests exist in integration_auth_test.go

// setupMockServer creates a test HTTP server and injects a test client
func setupMockServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handler)

	// Inject test HTTP client to bypass security.Client's HTTPS validation
	restore := network.SetTestClient(func() network.Client {
		return &http.Client{}
	})
	t.Cleanup(restore)

	return server
}

func TestAzureListProjects_Success(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify auth header
		auth := r.Header.Get("Authorization")
		assert.Contains(t, auth, "Basic")

		// Verify API version
		assert.Equal(t, "4.1", r.URL.Query().Get("api-version"))

		// Return mock projects
		response := AzureProjectsResponse{
			Value: []AzureProject{
				{ID: "proj-1", Name: "Project 1"},
				{ID: "proj-2", Name: "Project 2"},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}

	projects, err := ListAzureProjects(context.Background(), auth, "test-org")

	require.NoError(t, err)
	assert.Len(t, projects, 2)
	assert.Equal(t, "Project 1", projects[0].Name)
	assert.Equal(t, "Project 2", projects[1].Name)
}

func TestAzureListProjects_Pagination(t *testing.T) {
	requestCount := 0
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++

		continuationToken := r.URL.Query().Get("continuationToken")

		if continuationToken == "" {
			// First page
			response := AzureProjectsResponse{
				Value: []AzureProject{
					{ID: "proj-1", Name: "Project 1"},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("x-ms-continuationtoken", "page2")
			json.NewEncoder(w).Encode(response)
		} else if continuationToken == "page2" {
			// Second page
			response := AzureProjectsResponse{
				Value: []AzureProject{
					{ID: "proj-2", Name: "Project 2"},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			// No continuation token = last page
			json.NewEncoder(w).Encode(response)
		}
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}

	projects, err := ListAzureProjects(context.Background(), auth, "test-org")

	require.NoError(t, err)
	assert.Len(t, projects, 2)
	assert.Equal(t, 2, requestCount, "Should make 2 requests for pagination")
}

// Note: Testing visualstudio.com URL format is covered by E2E tests
// as it requires real URL construction that httptest can't easily simulate

func TestAzureProjects_EmptyOrgName(t *testing.T) {
	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: "https://dev.azure.com",
	}

	_, err := ListAzureProjects(context.Background(), auth, "")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "orgName is required")
}

func TestAzureProjects_APIError(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Unauthorized"}`))
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "bad-token",
		BaseURL: server.URL,
	}

	_, err := ListAzureProjects(context.Background(), auth, "test-org")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

func TestAzureRepos_Success(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify API version
		assert.Equal(t, "4.1", r.URL.Query().Get("api-version"))

		response := AzureReposResponse{
			Value: []AzureRepo{
				{
					Name:          "repo-1",
					DefaultBranch: "refs/heads/main",
					IsDisabled:    false,
					Project: struct {
						Name string `json:"name"`
					}{Name: "Project 1"},
				},
				{
					Name:          "repo-2",
					DefaultBranch: "refs/heads/develop",
					IsDisabled:    false,
					Project: struct {
						Name string `json:"name"`
					}{Name: "Project 1"},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}
	project := AzureProject{ID: "proj-1", Name: "Project 1"}

	repos, err := ListAzureRepos(context.Background(), auth, "test-org", project)

	require.NoError(t, err)
	assert.Len(t, repos, 2)
	assert.Equal(t, "repo-1", repos[0]["name"])
	assert.Equal(t, "Project 1", repos[0]["owner"])
	assert.Equal(t, "main", repos[0]["branch"]) // Branch has "refs/heads/" stripped
	assert.Equal(t, "develop", repos[1]["branch"])
}

func TestAzureRepos_FiltersDisabled(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := AzureReposResponse{
			Value: []AzureRepo{
				{
					Name:          "active-repo",
					DefaultBranch: "refs/heads/main",
					IsDisabled:    false,
					Project: struct {
						Name string `json:"name"`
					}{Name: "Project 1"},
				},
				{
					Name:          "disabled-repo",
					DefaultBranch: "refs/heads/main",
					IsDisabled:    true,
					Project: struct {
						Name string `json:"name"`
					}{Name: "Project 1"},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}
	project := AzureProject{ID: "proj-1", Name: "Project 1"}

	repos, err := ListAzureRepos(context.Background(), auth, "test-org", project)

	require.NoError(t, err)
	assert.Len(t, repos, 1)
	assert.Equal(t, "active-repo", repos[0]["name"])
}

func TestAzureRepos_EmptyOrgName(t *testing.T) {
	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: "https://dev.azure.com",
	}
	project := AzureProject{ID: "proj-1", Name: "Project 1"}

	_, err := ListAzureRepos(context.Background(), auth, "", project)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "orgName")
}

func TestListAllAzureRepos_Success(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/_apis/projects" || r.URL.Path == "/test-org/_apis/projects" {
			// Return projects
			response := AzureProjectsResponse{
				Value: []AzureProject{
					{ID: "proj-1", Name: "Project 1"},
					{ID: "proj-2", Name: "Project 2"},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		} else if r.URL.Path == "/proj-1/_apis/git/repositories" || r.URL.Path == "/test-org/proj-1/_apis/git/repositories" {
			// Return repos for project 1
			response := AzureReposResponse{
				Value: []AzureRepo{
					{
						Name:          "repo-1",
						DefaultBranch: "refs/heads/main",
						IsDisabled:    false,
						Project: struct {
							Name string `json:"name"`
						}{Name: "Project 1"},
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		} else if r.URL.Path == "/proj-2/_apis/git/repositories" || r.URL.Path == "/test-org/proj-2/_apis/git/repositories" {
			// Return repos for project 2
			response := AzureReposResponse{
				Value: []AzureRepo{
					{
						Name:          "repo-2",
						DefaultBranch: "refs/heads/main",
						IsDisabled:    false,
						Project: struct {
							Name string `json:"name"`
						}{Name: "Project 2"},
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		}
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}

	repos, err := ListAllAzureRepos(context.Background(), auth, "test-org")

	require.NoError(t, err)
	assert.Len(t, repos, 2)
	assert.Equal(t, "repo-1", repos[0]["name"])
	assert.Equal(t, "repo-2", repos[1]["name"])
}

func TestListAllAzureRepos_EmptyOrgName(t *testing.T) {
	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: "https://dev.azure.com",
	}

	_, err := ListAllAzureRepos(context.Background(), auth, "")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "orgName is required")
}

func TestAzureOrgIsEmpty_True(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return empty projects list
		response := AzureProjectsResponse{
			Value: []AzureProject{},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}

	isEmpty, err := AzureOrgIsEmpty(context.Background(), auth, "test-org")

	require.NoError(t, err)
	assert.True(t, isEmpty)
}

func TestAzureOrgIsEmpty_False(t *testing.T) {
	server := setupMockServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return projects
		response := AzureProjectsResponse{
			Value: []AzureProject{
				{ID: "proj-1", Name: "Project 1"},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := AzureConfig{
		Token:   "test-token",
		BaseURL: server.URL,
	}

	isEmpty, err := AzureOrgIsEmpty(context.Background(), auth, "test-org")

	require.NoError(t, err)
	assert.False(t, isEmpty)
}

// Note: ListAzureOrganizations uses hardcoded URLs (app.vssps.visualstudio.com)
// which cannot be easily mocked in unit tests. Consider integration tests or
// refactoring to accept a configurable profile service URL.
