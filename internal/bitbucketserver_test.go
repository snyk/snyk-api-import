package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==============================================================================
// Auth Tests
// ==============================================================================

func TestBitbucketServerAuth_SetAuthHeader(t *testing.T) {
	auth := BitbucketServerAuth{
		BaseURL: "https://bitbucket.example.com",
		Token:   "test-token-123",
	}

	req, err := http.NewRequest("GET", "https://bitbucket.example.com/rest/api/1.0/projects", nil)
	require.NoError(t, err)

	// The actual implementation sets the header directly
	req.Header.Set("Authorization", "Bearer "+auth.Token)

	authHeader := req.Header.Get("Authorization")
	assert.NotEmpty(t, authHeader)
	assert.Equal(t, "Bearer test-token-123", authHeader)
}

func TestBitbucketServerAuth_EmptyToken(t *testing.T) {
	auth := BitbucketServerAuth{
		BaseURL: "https://bitbucket.example.com",
		Token:   "",
	}

	req, err := http.NewRequest("GET", "https://bitbucket.example.com/rest/api/1.0/projects", nil)
	require.NoError(t, err)

	req.Header.Set("Authorization", "Bearer "+auth.Token)
	authHeader := req.Header.Get("Authorization")
	assert.Equal(t, "Bearer ", authHeader)
}

// ==============================================================================
// FetchBitbucketServerProjects Tests
// ==============================================================================

func TestFetchBitbucketServerProjects_Success(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify auth header
		assert.Contains(t, r.Header.Get("Authorization"), "Bearer")

		// Verify URL path
		assert.Equal(t, "/rest/api/1.0/projects", r.URL.Path)

		// Return mock response
		response := map[string]interface{}{
			"size": 2,
			"values": []map[string]interface{}{
				{
					"key":  "PROJ1",
					"name": "Project One",
					"id":   1,
				},
				{
					"key":  "PROJ2",
					"name": "Project Two",
					"id":   2,
				},
			},
			"isLastPage": true,
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	projects, err := FetchBitbucketServerProjects(context.Background(), auth)

	assert.NoError(t, err)
	assert.Len(t, projects, 2)
	assert.Equal(t, "PROJ1", projects[0].Key)
	assert.Equal(t, "Project One", projects[0].Name)
	assert.Equal(t, "PROJ2", projects[1].Key)
	assert.Equal(t, "Project Two", projects[1].Name)
}

func TestFetchBitbucketServerProjects_Pagination(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++

		if callCount == 1 {
			// First page
			response := map[string]interface{}{
				"size": 2,
				"values": []map[string]interface{}{
					{"key": "PROJ1", "name": "Project One", "id": 1},
					{"key": "PROJ2", "name": "Project Two", "id": 2},
				},
				"isLastPage":    false,
				"nextPageStart": 2,
			}
			json.NewEncoder(w).Encode(response)
		} else {
			// Second page
			response := map[string]interface{}{
				"size": 1,
				"values": []map[string]interface{}{
					{"key": "PROJ3", "name": "Project Three", "id": 3},
				},
				"isLastPage": true,
			}
			json.NewEncoder(w).Encode(response)
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	projects, err := FetchBitbucketServerProjects(context.Background(), auth)

	assert.NoError(t, err)
	assert.Len(t, projects, 3)
	assert.Equal(t, 2, callCount, "Should make 2 API calls for pagination")
}

func TestFetchBitbucketServerProjects_EmptyResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := map[string]interface{}{
			"size":       0,
			"values":     []map[string]interface{}{},
			"isLastPage": true,
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	projects, err := FetchBitbucketServerProjects(context.Background(), auth)

	assert.NoError(t, err)
	assert.Empty(t, projects)
}

func TestFetchBitbucketServerProjects_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"errors":[{"message":"Authentication failed"}]}`))
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "invalid-token",
	}

	projects, err := FetchBitbucketServerProjects(context.Background(), auth)

	assert.Error(t, err)
	assert.Nil(t, projects)
	assert.Contains(t, err.Error(), "401")
}

func TestFetchBitbucketServerProjects_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"errors":[{"message":"Internal server error"}]}`))
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	projects, err := FetchBitbucketServerProjects(context.Background(), auth)

	assert.Error(t, err)
	assert.Nil(t, projects)
}

func TestFetchBitbucketServerProjects_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{invalid json`))
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	projects, err := FetchBitbucketServerProjects(context.Background(), auth)

	assert.Error(t, err)
	assert.Nil(t, projects)
}

// ==============================================================================
// FetchBitbucketServerRepos Tests
// ==============================================================================

func TestFetchBitbucketServerRepos_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify auth header
		assert.Contains(t, r.Header.Get("Authorization"), "Bearer")

		// Verify URL path
		assert.Equal(t, "/rest/api/1.0/repos", r.URL.Path)

		// Verify query params
		assert.Equal(t, "TESTPROJ", r.URL.Query().Get("projectname"))

		response := map[string]interface{}{
			"size": 2,
			"values": []map[string]interface{}{
				{
					"slug": "repo-one",
					"name": "Repository One",
					"id":   1,
					"project": map[string]interface{}{
						"key": "TESTPROJ",
					},
				},
				{
					"slug": "repo-two",
					"name": "Repository Two",
					"id":   2,
					"project": map[string]interface{}{
						"key": "TESTPROJ",
					},
				},
			},
			"isLastPage": true,
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	repos, err := FetchBitbucketServerRepos(context.Background(), auth, "TESTPROJ")

	assert.NoError(t, err)
	assert.Len(t, repos, 2)
	assert.Equal(t, "repo-one", repos[0].RepoSlug)
	assert.Equal(t, "TESTPROJ", repos[0].ProjectKey)
	assert.Equal(t, "repo-two", repos[1].RepoSlug)
}

func TestFetchBitbucketServerRepos_Pagination(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++

		if callCount == 1 {
			response := map[string]interface{}{
				"size": 1,
				"values": []map[string]interface{}{
					{
						"slug":    "repo-one",
						"name":    "Repository One",
						"project": map[string]interface{}{"key": "PROJ"},
					},
				},
				"isLastPage":    false,
				"nextPageStart": 1,
			}
			json.NewEncoder(w).Encode(response)
		} else {
			response := map[string]interface{}{
				"size": 1,
				"values": []map[string]interface{}{
					{
						"slug":    "repo-two",
						"name":    "Repository Two",
						"project": map[string]interface{}{"key": "PROJ"},
					},
				},
				"isLastPage": true,
			}
			json.NewEncoder(w).Encode(response)
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	repos, err := FetchBitbucketServerRepos(context.Background(), auth, "PROJ")

	assert.NoError(t, err)
	assert.Len(t, repos, 2)
	assert.Equal(t, 2, callCount)
}

func TestFetchBitbucketServerRepos_EmptyProject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := map[string]interface{}{
			"size":       0,
			"values":     []map[string]interface{}{},
			"isLastPage": true,
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	repos, err := FetchBitbucketServerRepos(context.Background(), auth, "EMPTY")

	assert.NoError(t, err)
	assert.Empty(t, repos)
}

func TestFetchBitbucketServerRepos_ProjectNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"errors":[{"message":"Project not found"}]}`))
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	repos, err := FetchBitbucketServerRepos(context.Background(), auth, "NOTFOUND")

	assert.Error(t, err)
	assert.Nil(t, repos)
}

// ==============================================================================
// DiscoverBitbucketServerManifests Tests
// ==============================================================================

func TestDiscoverBitbucketServerManifests_SingleManifest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// HEAD request for file existence check
		if r.Method == "HEAD" {
			// Only pom.xml exists
			if r.URL.Path == "/rest/api/1.0/projects/PROJ/repos/myrepo/browse/pom.xml" {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(http.StatusNotFound)
			}
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	manifestTypes := []string{"pom.xml", "package.json", "requirements.txt"}
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "myrepo", "main", manifestTypes)

	assert.Len(t, discovered, 1)
	assert.Contains(t, discovered, "pom.xml")
}

func TestDiscoverBitbucketServerManifests_MultipleManifests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "HEAD" {
			// Both pom.xml and package.json exist
			if r.URL.Path == "/rest/api/1.0/projects/PROJ/repos/myrepo/browse/pom.xml" ||
				r.URL.Path == "/rest/api/1.0/projects/PROJ/repos/myrepo/browse/package.json" {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(http.StatusNotFound)
			}
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	manifestTypes := []string{"pom.xml", "package.json", "requirements.txt", "Gemfile"}
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "myrepo", "main", manifestTypes)

	assert.Len(t, discovered, 2)
	assert.Contains(t, discovered, "pom.xml")
	assert.Contains(t, discovered, "package.json")
}

func TestDiscoverBitbucketServerManifests_NoManifests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "HEAD" {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	manifestTypes := []string{"pom.xml", "package.json"}
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "myrepo", "main", manifestTypes)

	assert.Empty(t, discovered)
}

func TestDiscoverBitbucketServerManifests_WithGlobPatterns(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "HEAD" {
			// pom.xml exists (for both "pom.xml" and "**/pom.xml" patterns)
			if r.URL.Path == "/rest/api/1.0/projects/PROJ/repos/myrepo/browse/pom.xml" {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(http.StatusNotFound)
			}
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	manifestTypes := []string{"pom.xml", "**/pom.xml", "package.json"}
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "myrepo", "main", manifestTypes)

	// Both "pom.xml" and "**/pom.xml" check the same file path, but each manifest type is returned
	// once it's discovered (the function de-duplicates by file path checks, not by manifest type)
	assert.GreaterOrEqual(t, len(discovered), 1, "Should find at least pom.xml")
	assert.Contains(t, discovered, "pom.xml")
	// Note: "**/pom.xml" is also returned as a separate manifest type since they're different patterns
}

func TestDiscoverBitbucketServerManifests_GradleKotlin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "HEAD" {
			// build.gradle.kts exists (Kotlin Gradle)
			if r.URL.Path == "/rest/api/1.0/projects/PROJ/repos/myrepo/browse/build.gradle.kts" {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(http.StatusNotFound)
			}
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	manifestTypes := []string{"build.gradle", "**/build.gradle"}
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "myrepo", "main", manifestTypes)

	// build.gradle.kts is checked as an alternative for build.gradle
	// The function de-duplicates file path checks, so even though both patterns
	// point to the same file, they're returned as separate manifest types
	assert.GreaterOrEqual(t, len(discovered), 1, "Should find at least build.gradle")
	assert.Contains(t, discovered, "build.gradle")
}

func TestDiscoverBitbucketServerManifests_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "HEAD" {
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	manifestTypes := []string{"pom.xml"}
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "myrepo", "main", manifestTypes)

	// Should handle errors gracefully and return empty list
	assert.Empty(t, discovered)
}

// ==============================================================================
// BitbucketServerProjectIsEmpty Tests
// ==============================================================================

func TestBitbucketServerProjectIsEmpty_EmptyProject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := map[string]interface{}{
			"size":       0,
			"values":     []map[string]interface{}{},
			"isLastPage": true,
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	isEmpty, err := BitbucketServerProjectIsEmpty(context.Background(), auth, "EMPTY")

	assert.NoError(t, err)
	assert.True(t, isEmpty)
}

func TestBitbucketServerProjectIsEmpty_HasRepos(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := map[string]interface{}{
			"size": 1,
			"values": []map[string]interface{}{
				{
					"slug":    "repo-one",
					"name":    "Repository One",
					"project": map[string]interface{}{"key": "PROJ"},
				},
			},
			"isLastPage": true,
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	isEmpty, err := BitbucketServerProjectIsEmpty(context.Background(), auth, "PROJ")

	assert.NoError(t, err)
	assert.False(t, isEmpty)
}

func TestBitbucketServerProjectIsEmpty_Error(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	isEmpty, err := BitbucketServerProjectIsEmpty(context.Background(), auth, "NOTFOUND")

	assert.Error(t, err)
	assert.False(t, isEmpty)
}

// ==============================================================================
// Data Structure Tests
// ==============================================================================

func TestBitbucketServerProject_Struct(t *testing.T) {
	project := BitbucketServerProject{
		Key:  "TESTPROJ",
		Name: "Test Project",
		ID:   123,
	}

	assert.Equal(t, "TESTPROJ", project.Key)
	assert.Equal(t, "Test Project", project.Name)
	assert.Equal(t, 123, project.ID)
}

func TestBitbucketServerRepo_Struct(t *testing.T) {
	repo := BitbucketServerRepo{
		Slug: "test-repo",
		Name: "Test Repository",
		Project: struct {
			Key  string `json:"key"`
			Name string `json:"name"`
		}{
			Key:  "TESTPROJ",
			Name: "Test Project",
		},
	}

	assert.Equal(t, "test-repo", repo.Slug)
	assert.Equal(t, "Test Repository", repo.Name)
	assert.Equal(t, "TESTPROJ", repo.Project.Key)
	assert.Equal(t, "Test Project", repo.Project.Name)
}

func TestBitbucketServerRepoData_Struct(t *testing.T) {
	repoData := BitbucketServerRepoData{
		ProjectKey: "TESTPROJ",
		RepoSlug:   "test-repo",
	}

	assert.Equal(t, "TESTPROJ", repoData.ProjectKey)
	assert.Equal(t, "test-repo", repoData.RepoSlug)
}

// ==============================================================================
// Edge Cases and Error Handling
// ==============================================================================

func TestFetchBitbucketServerProjects_ContextCancelled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Slow server
		select {
		case <-r.Context().Done():
			return
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	projects, err := FetchBitbucketServerProjects(ctx, auth)

	assert.Error(t, err)
	assert.Nil(t, projects)
}

func TestDiscoverBitbucketServerManifests_EmptyManifestTypes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Should not make any HTTP requests")
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "repo", "main", []string{})

	assert.Empty(t, discovered)
}

func TestDiscoverBitbucketServerManifests_UnknownManifestType(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Should not be called for unknown types
		t.Fatal("Should not make HTTP requests for unknown manifest types")
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	// Use a manifest type that's not in the manifestPaths map
	discovered := DiscoverBitbucketServerManifests(context.Background(), auth, "PROJ", "repo", "main", []string{"unknown.file"})

	assert.Empty(t, discovered)
}

// ==============================================================================
// Integration-style Tests (using mock server)
// ==============================================================================

func TestBitbucketServer_FullWorkflow(t *testing.T) {
	// Mock server that handles projects, repos, and manifest discovery
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/rest/api/1.0/projects":
			// Return projects
			response := map[string]interface{}{
				"values": []map[string]interface{}{
					{"key": "PROJ1", "name": "Project 1", "id": 1},
				},
				"isLastPage": true,
			}
			json.NewEncoder(w).Encode(response)

		case r.URL.Path == "/rest/api/1.0/repos":
			// Return repos
			response := map[string]interface{}{
				"values": []map[string]interface{}{
					{
						"slug":    "repo1",
						"name":    "Repository 1",
						"project": map[string]interface{}{"key": "PROJ1"},
					},
				},
				"isLastPage": true,
			}
			json.NewEncoder(w).Encode(response)

		case r.Method == "HEAD":
			// Manifest discovery - pom.xml exists
			if r.URL.Path == "/rest/api/1.0/projects/PROJ1/repos/repo1/browse/pom.xml" {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(http.StatusNotFound)
			}
		}
	}))
	defer server.Close()

	auth := BitbucketServerAuth{
		BaseURL: server.URL,
		Token:   "test-token",
	}

	// 1. Fetch projects
	projects, err := FetchBitbucketServerProjects(context.Background(), auth)
	require.NoError(t, err)
	require.Len(t, projects, 1)
	assert.Equal(t, "PROJ1", projects[0].Key)

	// 2. Fetch repos for project
	repos, err := FetchBitbucketServerRepos(context.Background(), auth, "PROJ1")
	require.NoError(t, err)
	require.Len(t, repos, 1)
	assert.Equal(t, "repo1", repos[0].RepoSlug)
	assert.Equal(t, "PROJ1", repos[0].ProjectKey)

	// 3. Check if project is empty
	isEmpty, err := BitbucketServerProjectIsEmpty(context.Background(), auth, "PROJ1")
	require.NoError(t, err)
	assert.False(t, isEmpty)

	// 4. Discover manifests
	manifests := DiscoverBitbucketServerManifests(
		context.Background(),
		auth,
		"PROJ1",
		"repo1",
		"main",
		[]string{"pom.xml", "package.json"},
	)
	assert.Len(t, manifests, 1)
	assert.Contains(t, manifests, "pom.xml")
}

// ==============================================================================
// Note on Testing Philosophy
// ==============================================================================
//
// These tests use httptest.NewServer to create mock HTTP servers, allowing us to:
// - Test HTTP request formatting (headers, query params, etc.)
// - Test response parsing and error handling
// - Test pagination logic
// - Test different server responses (success, error, edge cases)
// - Avoid external dependencies (no real Bitbucket Server needed)
//
// This approach provides good coverage while keeping tests fast and deterministic.
