package internal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sam1el/snyk-api-import-go/internal/security"
	"github.com/sam1el/snyk-api-import-go/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImportResults_ThreadSafety(t *testing.T) {
	results := NewImportResults()
	var wg sync.WaitGroup

	// Concurrently add results from multiple goroutines
	numGoroutines := 100
	for i := 0; i < numGoroutines; i++ {
		wg.Add(3)
		go func(n int) {
			defer wg.Done()
			results.AddImported("imported-" + string(rune(n)))
		}(i)
		go func(n int) {
			defer wg.Done()
			results.AddFailed("failed-" + string(rune(n)))
		}(i)
		go func(n int) {
			defer wg.Done()
			results.AddSkipped("skipped-" + string(rune(n)))
		}(i)
	}

	wg.Wait()

	imported, failed, skipped := results.GetCounts()
	assert.Equal(t, numGoroutines, imported, "Should have correct imported count")
	assert.Equal(t, numGoroutines, failed, "Should have correct failed count")
	assert.Equal(t, numGoroutines, skipped, "Should have correct skipped count")
}

func TestImportResults_IsImported(t *testing.T) {
	results := NewImportResults()

	assert.False(t, results.IsImported("test-repo"), "Should not be imported initially")

	results.AddImported("test-repo")

	assert.True(t, results.IsImported("test-repo"), "Should be imported after adding")
	assert.False(t, results.IsImported("other-repo"), "Other repo should not be imported")
}

func TestGetImportConcurrency_Precedence(t *testing.T) {
	// Save original env vars
	origEnv := os.Getenv("SNYK_IMPORT_CONCURRENCY")
	defer func() {
		if origEnv != "" {
			os.Setenv("SNYK_IMPORT_CONCURRENCY", origEnv)
		} else {
			os.Unsetenv("SNYK_IMPORT_CONCURRENCY")
		}
	}()

	tests := []struct {
		name     string
		cliFlag  int
		envVar   string
		expected int
	}{
		{
			name:     "CLI flag takes precedence",
			cliFlag:  20,
			envVar:   "15",
			expected: 20,
		},
		{
			name:     "Env var when no CLI flag",
			cliFlag:  0,
			envVar:   "15",
			expected: 15,
		},
		{
			name:     "Default when no config",
			cliFlag:  0,
			envVar:   "",
			expected: 10,
		},
		{
			name:     "Invalid env var uses default",
			cliFlag:  0,
			envVar:   "invalid",
			expected: 10,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVar != "" {
				os.Setenv("SNYK_IMPORT_CONCURRENCY", tt.envVar)
			} else {
				os.Unsetenv("SNYK_IMPORT_CONCURRENCY")
			}

			result := GetImportConcurrency(tt.cliFlag)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetPollTimeout_Precedence(t *testing.T) {
	// Save original env var
	origEnv := os.Getenv("SNYK_POLL_TIMEOUT")
	defer func() {
		if origEnv != "" {
			os.Setenv("SNYK_POLL_TIMEOUT", origEnv)
		} else {
			os.Unsetenv("SNYK_POLL_TIMEOUT")
		}
	}()

	tests := []struct {
		name     string
		envVar   string
		expected time.Duration
	}{
		{
			name:     "Env var with valid duration",
			envVar:   "10m",
			expected: 10 * time.Minute,
		},
		{
			name:     "Default when no env var",
			envVar:   "",
			expected: 5 * time.Minute,
		},
		{
			name:     "Invalid env var uses default",
			envVar:   "invalid",
			expected: 5 * time.Minute,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVar != "" {
				os.Setenv("SNYK_POLL_TIMEOUT", tt.envVar)
			} else {
				os.Unsetenv("SNYK_POLL_TIMEOUT")
			}

			result := GetPollTimeout()
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestBuildImportPayload(t *testing.T) {
	tests := []struct {
		name     string
		target   ImportTarget
		scmType  string
		expected map[string]interface{}
	}{
		{
			name: "GitHub payload",
			target: ImportTarget{
				Target: Target{
					Name:   "test-repo",
					Owner:  "test-org",
					Branch: "main",
				},
			},
			scmType: "github",
			expected: map[string]interface{}{
				"name":   "test-repo",
				"owner":  "test-org",
				"branch": "main",
			},
		},
		{
			name: "GitLab payload",
			target: ImportTarget{
				Target: Target{
					ID:     12345,
					Branch: "main",
				},
			},
			scmType: "gitlab",
			expected: map[string]interface{}{
				"id":     12345,
				"branch": "main",
			},
		},
		{
			name: "Bitbucket Server payload",
			target: ImportTarget{
				Target: Target{
					ProjectKey: "PROJ",
					RepoSlug:   "repo-slug",
					Branch:     "main",
				},
			},
			scmType: "bitbucket-server",
			expected: map[string]interface{}{
				"projectKey": "PROJ",
				"repoSlug":   "repo-slug",
				"branch":     "main",
			},
		},
		{
			name: "Azure payload",
			target: ImportTarget{
				Target: Target{
					Name:   "test-repo",
					Owner:  "test-org",
					Branch: "main",
				},
			},
			scmType: "azure-repos",
			expected: map[string]interface{}{
				"name":   "test-repo",
				"owner":  "test-org",
				"branch": "main",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildImportPayload(tt.target, tt.scmType)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetTargetDisplayName(t *testing.T) {
	tests := []struct {
		name     string
		target   ImportTarget
		scmType  string
		expected string
	}{
		{
			name: "GitHub with owner/name",
			target: ImportTarget{
				Target: Target{
					Owner: "test-org",
					Name:  "test-repo",
				},
			},
			scmType:  "github",
			expected: "test-org/test-repo",
		},
		{
			name: "GitLab with full_name",
			target: ImportTarget{
				Target: Target{
					FullName: "group/subgroup/repo",
				},
			},
			scmType:  "gitlab",
			expected: "group/subgroup/repo",
		},
		{
			name: "Bitbucket Server with projectKey/repoSlug",
			target: ImportTarget{
				Target: Target{
					ProjectKey: "PROJ",
					RepoSlug:   "repo-slug",
				},
			},
			scmType:  "bitbucket-server",
			expected: "PROJ/repo-slug",
		},
		{
			name: "Azure with owner/name",
			target: ImportTarget{
				Target: Target{
					Owner: "azure-org",
					Name:  "test-repo",
				},
			},
			scmType:  "azure-repos",
			expected: "azure-org/test-repo",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getTargetDisplayName(tt.target, tt.scmType)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestParallelImport_Success(t *testing.T) {
	// Track import calls
	importCount := 0
	var mu sync.Mutex

	// Create mock server with custom handler
	_, cleanup := testutil.SetupImportTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/import") {
			mu.Lock()
			importCount++
			mu.Unlock()
			w.Header().Set("Location", "/api/v1/org/test-org/integrations/test-int/import/job-123")
			w.WriteHeader(http.StatusCreated)
		}
	})
	defer cleanup()

	// Create test targets
	targets := []ImportTarget{
		{
			Target: Target{Name: "repo1", Owner: "org1", Branch: "main"},
			OrgID:  "test-org", IntegrationID: "test-int",
		},
		{
			Target: Target{Name: "repo2", Owner: "org1", Branch: "main"},
			OrgID:  "test-org", IntegrationID: "test-int",
		},
	}

	// Configure parallel import
	config := ParallelImportConfig{
		OrgID:         "test-org",
		IntegrationID: "test-int",
		Source:        "github",
		Concurrency:   2,
		SnykToken:     "test-token",
		PollTimeout:   1 * time.Second,
	}

	// Execute parallel import
	ctx := context.Background()
	results, err := ParallelImport(ctx, targets, config)

	// Assertions
	require.NoError(t, err)
	assert.NotNil(t, results)

	imported, failed, skipped := results.GetCounts()
	assert.Equal(t, 2, imported, "Should import 2 targets")
	assert.Equal(t, 0, failed, "Should have no failures")
	assert.Equal(t, 0, skipped, "Should have no skipped")

	mu.Lock()
	assert.Equal(t, 2, importCount, "Should make 2 import API calls")
	mu.Unlock()
}

func TestParallelImport_DuplicateDetection(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/import") {
			w.Header().Set("Location", "/api/v1/org/test-org/integrations/test-int/import/job-123")
			w.WriteHeader(http.StatusCreated)
		}
	}))
	defer server.Close()

	// Extract host from server URL for security client
	serverURL := strings.TrimPrefix(server.URL, "http://")
	serverURL = strings.TrimPrefix(serverURL, "https://")

	// Set up environment
	os.Setenv("SNYK_API", server.URL)
	os.Setenv("SNYK_SKIP_POLL", "1")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1") // Allow HTTP URLs in tests
	defer os.Unsetenv("SNYK_API")
	defer os.Unsetenv("SNYK_SKIP_POLL")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	// Create duplicate targets
	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "repo1",
				Owner:  "org1",
				Branch: "main",
			},
			OrgID:         "test-org",
			IntegrationID: "test-int",
		},
		{
			Target: Target{
				Name:   "repo1", // Duplicate
				Owner:  "org1",
				Branch: "develop", // Different branch, but same repo
			},
			OrgID:         "test-org",
			IntegrationID: "test-int",
		},
	}

	config := ParallelImportConfig{
		OrgID:         "test-org",
		IntegrationID: "test-int",
		Source:        "github",
		Concurrency:   2,
		SnykToken:     "test-token",
		PollTimeout:   1 * time.Second,
	}

	mockClient := &http.Client{Timeout: 10 * time.Second}
	restore := security.SetTestHTTPClient(mockClient, []string{serverURL})
	defer restore()

	ctx := context.Background()
	results, err := ParallelImport(ctx, targets, config)

	require.NoError(t, err)
	imported, failed, skipped := results.GetCounts()
	assert.Equal(t, 1, imported, "Should import only 1 target")
	assert.Equal(t, 0, failed, "Should have no failures")
	assert.Equal(t, 1, skipped, "Should skip 1 duplicate")
}

func TestParallelImport_RateLimitRetry(t *testing.T) {
	// Create mock server that rate limits first, then succeeds
	attemptCount := 0
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/import") {
			mu.Lock()
			attemptCount++
			currentAttempt := attemptCount
			mu.Unlock()

			if currentAttempt == 1 {
				// First attempt: rate limit
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"rate limited"}`))
			} else {
				// Second attempt: success
				w.Header().Set("Location", "/api/v1/org/test-org/integrations/test-int/import/job-123")
				w.WriteHeader(http.StatusCreated)
			}
		}
	}))
	defer server.Close()

	// Extract host from server URL for security client
	serverURL := strings.TrimPrefix(server.URL, "http://")
	serverURL = strings.TrimPrefix(serverURL, "https://")

	os.Setenv("SNYK_API", server.URL)
	os.Setenv("SNYK_SKIP_POLL", "1")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1") // Allow HTTP URLs in tests
	defer os.Unsetenv("SNYK_API")
	defer os.Unsetenv("SNYK_SKIP_POLL")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "repo1",
				Owner:  "org1",
				Branch: "main",
			},
			OrgID:         "test-org",
			IntegrationID: "test-int",
		},
	}

	config := ParallelImportConfig{
		OrgID:         "test-org",
		IntegrationID: "test-int",
		Source:        "github",
		Concurrency:   1,
		SnykToken:     "test-token",
		PollTimeout:   1 * time.Second,
	}

	mockClient := &http.Client{Timeout: 10 * time.Second}
	restore := security.SetTestHTTPClient(mockClient, []string{serverURL})
	defer restore()

	ctx := context.Background()
	results, err := ParallelImport(ctx, targets, config)

	require.NoError(t, err)
	imported, failed, _ := results.GetCounts()
	assert.Equal(t, 1, imported, "Should eventually succeed after retry")
	assert.Equal(t, 0, failed, "Should have no failures")

	mu.Lock()
	assert.GreaterOrEqual(t, attemptCount, 2, "Should retry after rate limit")
	mu.Unlock()
}

func TestParallelImport_FailureHandling(t *testing.T) {
	// Create mock server that always fails with 400
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/import") {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"invalid request"}`))
		}
	}))
	defer server.Close()

	os.Setenv("SNYK_API", server.URL)
	os.Setenv("SNYK_SKIP_POLL", "1")
	defer os.Unsetenv("SNYK_API")
	defer os.Unsetenv("SNYK_SKIP_POLL")

	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "repo1",
				Owner:  "org1",
				Branch: "main",
			},
			OrgID:         "test-org",
			IntegrationID: "test-int",
		},
	}

	config := ParallelImportConfig{
		OrgID:         "test-org",
		IntegrationID: "test-int",
		Source:        "github",
		Concurrency:   1,
		SnykToken:     "test-token",
		PollTimeout:   1 * time.Second,
	}

	mockClient := &http.Client{Timeout: 10 * time.Second}
	restore := security.SetTestHTTPClient(mockClient, []string{"localhost", "127.0.0.1"})
	defer restore()

	ctx := context.Background()
	results, err := ParallelImport(ctx, targets, config)

	require.NoError(t, err) // Function doesn't return error, tracks failures in results
	imported, failed, _ := results.GetCounts()
	assert.Equal(t, 0, imported, "Should have no successful imports")
	assert.Equal(t, 1, failed, "Should have 1 failure")
}

func TestParallelImport_Concurrency(t *testing.T) {
	// Track concurrent requests
	var activeCalls int32
	var maxConcurrent int32
	var mu sync.Mutex

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/import") {
			mu.Lock()
			activeCalls++
			if activeCalls > maxConcurrent {
				maxConcurrent = activeCalls
			}
			mu.Unlock()

			// Simulate some work
			time.Sleep(50 * time.Millisecond)

			mu.Lock()
			activeCalls--
			mu.Unlock()

			w.Header().Set("Location", "/api/v1/org/test-org/integrations/test-int/import/job-123")
			w.WriteHeader(http.StatusCreated)
		}
	}))
	defer server.Close()

	// Extract host from server URL for security client
	serverURL := strings.TrimPrefix(server.URL, "http://")
	serverURL = strings.TrimPrefix(serverURL, "https://")

	os.Setenv("SNYK_API", server.URL)
	os.Setenv("SNYK_SKIP_POLL", "1")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1") // Allow HTTP URLs in tests
	defer os.Unsetenv("SNYK_API")
	defer os.Unsetenv("SNYK_SKIP_POLL")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	// Create 10 targets
	targets := make([]ImportTarget, 10)
	for i := 0; i < 10; i++ {
		targets[i] = ImportTarget{
			Target: Target{
				Name:   "repo" + string(rune(i)),
				Owner:  "org1",
				Branch: "main",
			},
			OrgID:         "test-org",
			IntegrationID: "test-int",
		}
	}

	config := ParallelImportConfig{
		OrgID:         "test-org",
		IntegrationID: "test-int",
		Source:        "github",
		Concurrency:   3, // Limit to 3 concurrent
		SnykToken:     "test-token",
		PollTimeout:   1 * time.Second,
	}

	mockClient := &http.Client{Timeout: 10 * time.Second}
	restore := security.SetTestHTTPClient(mockClient, []string{serverURL})
	defer restore()

	ctx := context.Background()
	results, err := ParallelImport(ctx, targets, config)

	require.NoError(t, err)
	imported, _, _ := results.GetCounts()
	assert.Equal(t, 10, imported, "Should import all 10 targets")

	mu.Lock()
	assert.LessOrEqual(t, maxConcurrent, int32(3), "Should respect concurrency limit")
	assert.GreaterOrEqual(t, maxConcurrent, int32(2), "Should have some concurrency")
	mu.Unlock()
}
