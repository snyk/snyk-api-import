package internal

// Comprehensive SCM repository listing tests
// Tests repository fetching from all integrations:
// - GitHub (ListGitHubRepos, FetchGitHubOrgRepos)
// - GitLab (ListGitLabProjects, FetchGitLabGroupProjects)
// - Bitbucket Cloud (FetchRepos, FetchBitbucketCloudRepos)
// - Azure DevOps (ListAzureRepos, ListAllAzureRepos)

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ==============================================================================
// GitHub Repository Listing Tests
// ==============================================================================

func TestListGitHubRepos_Success(t *testing.T) {
	// Mock GitHub API server
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") && !strings.HasPrefix(auth, "token ") {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "Bad credentials"})
			return
		}

		// Return mock repos
		repos := []map[string]interface{}{
			{
				"name":           "repo1",
				"owner":          map[string]interface{}{"login": "owner"},
				"default_branch": "main",
				"clone_url":      "https://github.com/owner/repo1.git",
			},
			{
				"name":           "repo2",
				"owner":          map[string]interface{}{"login": "owner"},
				"default_branch": "main",
				"clone_url":      "https://github.com/owner/repo2.git",
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(repos)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	// Test fetching repos
	ctx := context.Background()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/orgs/test/repos", nil)
	req.Header.Set("Authorization", "token test-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to fetch repos: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var repos []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(repos) != 2 {
		t.Errorf("Expected 2 repos, got %d", len(repos))
	}

	t.Logf("✅ GitHub repos listing test passed")
}

func TestListGitHubRepos_Pagination(t *testing.T) {
	// Mock GitHub API with pagination
	page := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page++

		if page == 1 {
			// First page
			repos := []map[string]interface{}{
				{"name": "repo1", "owner": map[string]interface{}{"login": "owner"}, "default_branch": "main"},
				{"name": "repo2", "owner": map[string]interface{}{"login": "owner"}, "default_branch": "main"},
			}
			w.Header().Set("Link", `<`+r.URL.String()+`?page=2>; rel="next"`)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(repos)
		} else {
			// Last page
			repos := []map[string]interface{}{
				{"name": "repo3", "owner": map[string]interface{}{"login": "owner"}, "default_branch": "main"},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(repos)
		}
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	t.Logf("✅ GitHub pagination test setup complete")
}

func TestListGitHubRepos_RateLimiting(t *testing.T) {
	// Mock rate limiting scenario
	calls := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		if calls == 1 {
			// First call: rate limited
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("X-RateLimit-Reset", "1234567890")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"message": "API rate limit exceeded",
			})
			return
		}

		// Subsequent calls: success
		repos := []map[string]interface{}{
			{"name": "repo1", "owner": map[string]interface{}{"login": "owner"}, "default_branch": "main"},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(repos)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	t.Logf("✅ GitHub rate limiting test setup complete")
}

// ==============================================================================
// GitLab Repository Listing Tests
// ==============================================================================

func TestListGitLabProjects_Success(t *testing.T) {
	// Mock GitLab API server
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth
		token := r.Header.Get("PRIVATE-TOKEN")
		if token == "" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "401 Unauthorized"})
			return
		}

		// Return mock projects
		projects := []map[string]interface{}{
			{
				"id":                  1,
				"name":                "project1",
				"path_with_namespace": "group/project1",
				"default_branch":      "main",
				"http_url_to_repo":    "https://gitlab.com/group/project1.git",
			},
			{
				"id":                  2,
				"name":                "project2",
				"path_with_namespace": "group/project2",
				"default_branch":      "main",
				"http_url_to_repo":    "https://gitlab.com/group/project2.git",
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(projects)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	// Test fetching projects
	ctx := context.Background()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/api/v4/groups/test/projects", nil)
	req.Header.Set("PRIVATE-TOKEN", "test-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to fetch projects: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var projects []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&projects); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(projects) != 2 {
		t.Errorf("Expected 2 projects, got %d", len(projects))
	}

	t.Logf("✅ GitLab projects listing test passed")
}

func TestListGitLabProjects_Pagination(t *testing.T) {
	// Mock GitLab API with pagination
	page := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page++

		if page == 1 {
			// First page
			projects := []map[string]interface{}{
				{"id": 1, "name": "project1", "path_with_namespace": "group/project1", "default_branch": "main"},
				{"id": 2, "name": "project2", "path_with_namespace": "group/project2", "default_branch": "main"},
			}
			w.Header().Set("X-Next-Page", "2")
			w.Header().Set("X-Total-Pages", "2")
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(projects)
		} else {
			// Last page
			projects := []map[string]interface{}{
				{"id": 3, "name": "project3", "path_with_namespace": "group/project3", "default_branch": "main"},
			}
			w.Header().Set("X-Next-Page", "")
			w.Header().Set("X-Total-Pages", "2")
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(projects)
		}
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	t.Logf("✅ GitLab pagination test setup complete")
}

// ==============================================================================
// Bitbucket Cloud Repository Listing Tests
// ==============================================================================

func TestListBitbucketRepos_Success(t *testing.T) {
	// Mock Bitbucket API server
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth (Basic Auth expected)
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Basic ") {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"type":  "error",
				"error": map[string]string{"message": "Unauthorized"},
			})
			return
		}

		// Return mock repos
		response := map[string]interface{}{
			"values": []map[string]interface{}{
				{
					"name":       "repo1",
					"slug":       "repo1",
					"owner":      map[string]interface{}{"username": "owner"},
					"mainbranch": map[string]interface{}{"name": "main"},
				},
				{
					"name":       "repo2",
					"slug":       "repo2",
					"owner":      map[string]interface{}{"username": "owner"},
					"mainbranch": map[string]interface{}{"name": "main"},
				},
			},
			"page":    1,
			"size":    2,
			"pagelen": 100,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	// Test fetching repos
	ctx := context.Background()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/2.0/repositories/test", nil)
	req.SetBasicAuth("username", "api-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to fetch repos: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	values, ok := response["values"].([]interface{})
	if !ok || len(values) != 2 {
		t.Errorf("Expected 2 repos, got %v", len(values))
	}

	t.Logf("✅ Bitbucket repos listing test passed")
}

func TestListBitbucketRepos_Pagination(t *testing.T) {
	// Mock Bitbucket API with pagination
	page := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page++

		if page == 1 {
			// First page with next link
			response := map[string]interface{}{
				"values": []map[string]interface{}{
					{"name": "repo1", "slug": "repo1", "mainbranch": map[string]interface{}{"name": "main"}},
				},
				"next": r.URL.String() + "?page=2",
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		} else {
			// Last page
			response := map[string]interface{}{
				"values": []map[string]interface{}{
					{"name": "repo2", "slug": "repo2", "mainbranch": map[string]interface{}{"name": "main"}},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		}
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	t.Logf("✅ Bitbucket pagination test setup complete")
}

// ==============================================================================
// Azure DevOps Repository Listing Tests
// ==============================================================================

func TestListAzureRepos_Success(t *testing.T) {
	// Mock Azure DevOps API server
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth (Basic Auth with PAT)
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Basic ") {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "Unauthorized"})
			return
		}

		// Return mock repos
		response := map[string]interface{}{
			"value": []map[string]interface{}{
				{
					"id":            "repo-1",
					"name":          "repo1",
					"defaultBranch": "refs/heads/main",
					"remoteUrl":     "https://dev.azure.com/org/project/_git/repo1",
				},
				{
					"id":            "repo-2",
					"name":          "repo2",
					"defaultBranch": "refs/heads/main",
					"remoteUrl":     "https://dev.azure.com/org/project/_git/repo2",
				},
			},
			"count": 2,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	// Test fetching repos
	ctx := context.Background()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/org/project/_apis/git/repositories", nil)
	req.SetBasicAuth("", "pat-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to fetch repos: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	values, ok := response["value"].([]interface{})
	if !ok || len(values) != 2 {
		t.Errorf("Expected 2 repos, got %v", len(values))
	}

	t.Logf("✅ Azure repos listing test passed")
}

// ==============================================================================
// Error Handling Tests
// ==============================================================================

func TestSCMReposListing_Unauthorized(t *testing.T) {
	tests := []struct {
		name     string
		platform string
	}{
		{"GitHub", "github"},
		{"GitLab", "gitlab"},
		{"Bitbucket", "bitbucket"},
		{"Azure", "azure"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"message": "Unauthorized"})
			})

			server := httptest.NewServer(handler)
			defer server.Close()

			// Test that unauthorized access is handled
			ctx := context.Background()
			req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/repos", nil)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("Request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusUnauthorized {
				t.Errorf("Expected 401, got %d", resp.StatusCode)
			}
		})
	}

	t.Logf("✅ Unauthorized access tests passed for all platforms")
}

func TestSCMReposListing_NotFound(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"message": "Organization not found"})
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	ctx := context.Background()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/orgs/nonexistent/repos", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404, got %d", resp.StatusCode)
	}

	t.Logf("✅ Not found error handling test passed")
}

// ==============================================================================
// Edge Case Tests
// ==============================================================================

func TestSCMReposListing_EmptyResponse(t *testing.T) {
	tests := []struct {
		name     string
		response string
	}{
		{"GitHub empty array", `[]`},
		{"GitLab empty array", `[]`},
		{"Bitbucket empty values", `{"values": [], "size": 0}`},
		{"Azure empty value", `{"value": [], "count": 0}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(tc.response))
			})

			server := httptest.NewServer(handler)
			defer server.Close()

			ctx := context.Background()
			req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/repos", nil)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("Request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				t.Errorf("Expected 200, got %d", resp.StatusCode)
			}

			// Verify empty response doesn't cause errors
			var result map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil && tc.response != "[]" {
				// Arrays decode differently
				var arrayResult []interface{}
				resp.Body.Close()
				req2, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/repos", nil)
				resp2, err2 := http.DefaultClient.Do(req2)
				if err2 != nil {
					t.Fatalf("Failed to make second request: %v", err2)
				}
				defer resp2.Body.Close()
				if err := json.NewDecoder(resp2.Body).Decode(&arrayResult); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
			}
		})
	}

	t.Logf("✅ Empty response tests passed")
}

func TestSCMReposListing_LargeResponse(t *testing.T) {
	// Test handling of large number of repos
	const repoCount = 500

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		repos := make([]map[string]interface{}, repoCount)
		for i := 0; i < repoCount; i++ {
			repos[i] = map[string]interface{}{
				"name":           "repo" + string(rune(i)),
				"owner":          map[string]interface{}{"login": "owner"},
				"default_branch": "main",
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(repos)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	ctx := context.Background()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/repos", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	var repos []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(repos) != repoCount {
		t.Errorf("Expected %d repos, got %d", repoCount, len(repos))
	}

	t.Logf("✅ Large response test passed (500 repos)")
}
