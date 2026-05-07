package internal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/snyk/snyk-api-import/internal/network"
)

func TestUpdateProjectBranch_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request
		if r.Method != "PUT" {
			t.Errorf("Expected PUT request, got %s", r.Method)
		}
		if r.Header.Get("Authorization") != "token test-snyk-token" {
			t.Errorf("Expected Authorization header 'token test-snyk-token', got %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Expected Content-Type 'application/json', got %q", r.Header.Get("Content-Type"))
		}

		// Verify URL path
		expectedPath := "/v1/org/test-org-id/project/test-project-id"
		if r.URL.Path != expectedPath {
			t.Errorf("Expected path %q, got %q", expectedPath, r.URL.Path)
		}

		// Return success
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	// Set environment variables
	t.Setenv("SNYK_TOKEN", "test-snyk-token")
	t.Setenv("SNYK_API", srv.URL)

	// Override network client
	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	err := UpdateProjectBranch(ctx, "test-org-id", "test-project-id", "new-branch")

	if err != nil {
		t.Fatalf("UpdateProjectBranch() error = %v", err)
	}
}

func TestUpdateProjectBranch_MissingParameters(t *testing.T) {
	t.Setenv("SNYK_TOKEN", "test-token")

	tests := []struct {
		name      string
		orgID     string
		projectID string
		branch    string
		wantErr   string
	}{
		{
			name:      "missing orgID",
			orgID:     "",
			projectID: "proj-123",
			branch:    "main",
			wantErr:   "orgID, projectID, and newBranch are required",
		},
		{
			name:      "missing projectID",
			orgID:     "org-123",
			projectID: "",
			branch:    "main",
			wantErr:   "orgID, projectID, and newBranch are required",
		},
		{
			name:      "missing branch",
			orgID:     "org-123",
			projectID: "proj-123",
			branch:    "",
			wantErr:   "orgID, projectID, and newBranch are required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			err := UpdateProjectBranch(ctx, tt.orgID, tt.projectID, tt.branch)

			if err == nil {
				t.Error("Expected error for missing parameter, got nil")
			} else if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Expected error containing %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestUpdateProjectBranch_MissingToken(t *testing.T) {
	// Clear environment variables
	t.Setenv("SNYK_TOKEN", "")
	t.Setenv("SNYK_API_TOKEN", "")

	ctx := context.Background()
	err := UpdateProjectBranch(ctx, "org-123", "proj-123", "main")

	if err == nil {
		t.Error("Expected error for missing token, got nil")
	} else if !strings.Contains(err.Error(), "SNYK_TOKEN or SNYK_API_TOKEN") {
		t.Errorf("Expected error about missing token, got %q", err.Error())
	}
}

func TestUpdateProjectBranch_APIError(t *testing.T) {
	// Use fast retry config for tests
	restoreRetry := SetDefaultRetryConfig(TestRetryConfig())
	defer restoreRetry()

	tests := []struct {
		name       string
		statusCode int
		body       string
		wantErr    string
	}{
		{
			name:       "unauthorized",
			statusCode: 401,
			body:       `{"message":"Unauthorized"}`,
			wantErr:    "unexpected status: 401",
		},
		{
			name:       "not found",
			statusCode: 404,
			body:       `{"message":"Project not found"}`,
			wantErr:    "unexpected status: 404",
		},
		{
			name:       "server error",
			statusCode: 500,
			body:       `{"message":"Internal error"}`,
			wantErr:    "max retries exceeded", // 500 is retried, eventually fails
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			t.Setenv("SNYK_TOKEN", "test-token")
			t.Setenv("SNYK_API", srv.URL)

			restore := network.SetTestClient(func() network.Client {
				return &mockHTTPClient{
					doFunc: func(req *http.Request) (*http.Response, error) {
						req.URL.Scheme = "http"
						req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
						return http.DefaultClient.Do(req)
					},
				}
			})
			defer restore()

			ctx := context.Background()
			err := UpdateProjectBranch(ctx, "org-123", "proj-123", "main")

			if err == nil {
				t.Errorf("Expected error for status %d, got nil", tt.statusCode)
			} else if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Expected error containing %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestBulkUpdateProjectBranches_DryRun(t *testing.T) {
	jobs := []BranchUpdateJob{
		{ProjectID: "proj-1", OldBranch: "old1", NewBranch: "new1"},
		{ProjectID: "proj-2", OldBranch: "old2", NewBranch: "new2"},
		{ProjectID: "proj-3", OldBranch: "old3", NewBranch: "new3"},
	}

	ctx := context.Background()
	result, err := BulkUpdateProjectBranches(ctx, "org-123", jobs, true)

	if err != nil {
		t.Fatalf("BulkUpdateProjectBranches() error = %v", err)
	}

	if len(result.Success) != 3 {
		t.Errorf("Expected 3 successful updates in dry-run, got %d", len(result.Success))
	}

	if len(result.Failed) != 0 {
		t.Errorf("Expected 0 failures in dry-run, got %d", len(result.Failed))
	}

	// Verify all project IDs are in success list
	for _, job := range jobs {
		found := false
		for _, successId := range result.Success {
			if successId == job.ProjectID {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected project %s in success list", job.ProjectID)
		}
	}
}

func TestBulkUpdateProjectBranches_EmptyJobs(t *testing.T) {
	ctx := context.Background()
	result, err := BulkUpdateProjectBranches(ctx, "org-123", []BranchUpdateJob{}, false)

	if err != nil {
		t.Fatalf("BulkUpdateProjectBranches() with empty jobs error = %v", err)
	}

	if len(result.Success) != 0 {
		t.Errorf("Expected 0 successful updates, got %d", len(result.Success))
	}

	if len(result.Failed) != 0 {
		t.Errorf("Expected 0 failures, got %d", len(result.Failed))
	}
}

func TestBulkUpdateProjectBranches_MissingOrgId(t *testing.T) {
	jobs := []BranchUpdateJob{
		{ProjectID: "proj-1", OldBranch: "old", NewBranch: "new"},
	}

	ctx := context.Background()
	_, err := BulkUpdateProjectBranches(ctx, "", jobs, false)

	if err == nil {
		t.Error("Expected error for missing orgID, got nil")
	} else if !strings.Contains(err.Error(), "orgID is required") {
		t.Errorf("Expected error about missing orgID, got %q", err.Error())
	}
}

func TestBulkUpdateProjectBranches_Success(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "test-token")
	t.Setenv("SNYK_API", srv.URL)

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	jobs := []BranchUpdateJob{
		{ProjectID: "proj-1", OldBranch: "old1", NewBranch: "new1"},
		{ProjectID: "proj-2", OldBranch: "old2", NewBranch: "new2"},
	}

	ctx := context.Background()
	result, err := BulkUpdateProjectBranches(ctx, "org-123", jobs, false)

	if err != nil {
		t.Fatalf("BulkUpdateProjectBranches() error = %v", err)
	}

	if len(result.Success) != 2 {
		t.Errorf("Expected 2 successful updates, got %d", len(result.Success))
	}

	if len(result.Failed) != 0 {
		t.Errorf("Expected 0 failures, got %d", len(result.Failed))
	}

	if atomic.LoadInt32(&callCount) != 2 {
		t.Errorf("Expected 2 API calls, got %d", atomic.LoadInt32(&callCount))
	}
}

func TestBulkUpdateProjectBranches_PartialFailure(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&callCount, 1)
		// First call succeeds, second fails
		if count == 1 {
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"ok":true}`))
		} else {
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"message":"Project not found"}`))
		}
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "test-token")
	t.Setenv("SNYK_API", srv.URL)

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	jobs := []BranchUpdateJob{
		{ProjectID: "proj-1", OldBranch: "old1", NewBranch: "new1"},
		{ProjectID: "proj-2", OldBranch: "old2", NewBranch: "new2"},
	}

	ctx := context.Background()
	result, err := BulkUpdateProjectBranches(ctx, "org-123", jobs, false)

	if err != nil {
		t.Fatalf("BulkUpdateProjectBranches() error = %v", err)
	}

	if len(result.Success) != 1 {
		t.Errorf("Expected 1 successful update, got %d", len(result.Success))
	}

	if len(result.Failed) != 1 {
		t.Errorf("Expected 1 failure, got %d", len(result.Failed))
	}

	// Verify one of the projects failed (could be either due to concurrent execution)
	if len(result.Failed) == 0 {
		t.Error("Expected at least one project in failed map")
	}

	// Verify the failed project has an error message
	for projID, errMsg := range result.Failed {
		if errMsg == "" {
			t.Errorf("Project %s in failed map has empty error message", projID)
		}
	}
}

func TestBranchUpdateJob_Validation(t *testing.T) {
	// Test that BranchUpdateJob struct can be created and accessed
	job := BranchUpdateJob{
		ProjectID: "test-proj",
		OldBranch: "old-branch",
		NewBranch: "new-branch",
	}

	if job.ProjectID != "test-proj" {
		t.Errorf("Expected ProjectId 'test-proj', got %q", job.ProjectID)
	}
	if job.OldBranch != "old-branch" {
		t.Errorf("Expected OldBranch 'old-branch', got %q", job.OldBranch)
	}
	if job.NewBranch != "new-branch" {
		t.Errorf("Expected NewBranch 'new-branch', got %q", job.NewBranch)
	}
}

func TestBulkUpdateBranchesResult_Structure(t *testing.T) {
	// Test that BulkUpdateBranchesResult struct works as expected
	result := BulkUpdateBranchesResult{
		Success: []string{"proj-1", "proj-2"},
		Failed:  map[string]string{"proj-3": "error message"},
	}

	if len(result.Success) != 2 {
		t.Errorf("Expected 2 success entries, got %d", len(result.Success))
	}

	if len(result.Failed) != 1 {
		t.Errorf("Expected 1 failed entry, got %d", len(result.Failed))
	}

	if result.Failed["proj-3"] != "error message" {
		t.Errorf("Expected error message for proj-3, got %q", result.Failed["proj-3"])
	}
}

func TestUpdateProjectBranch_TokenPriority(t *testing.T) {
	// Test that SNYK_TOKEN is preferred over SNYK_API_TOKEN
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "token snyk-token-value" {
			t.Errorf("Expected Authorization 'token snyk-token-value', got %q", authHeader)
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "snyk-token-value")
	t.Setenv("SNYK_API_TOKEN", "api-token-value")
	t.Setenv("SNYK_API", srv.URL)

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	err := UpdateProjectBranch(ctx, "org-123", "proj-123", "main")

	if err != nil {
		t.Fatalf("UpdateProjectBranch() error = %v", err)
	}
}

func TestUpdateProjectBranch_FallbackToAPIToken(t *testing.T) {
	// Test that SNYK_API_TOKEN is used when SNYK_TOKEN is not set
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "token api-token-value" {
			t.Errorf("Expected Authorization 'token api-token-value', got %q", authHeader)
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "")
	t.Setenv("SNYK_API_TOKEN", "api-token-value")
	t.Setenv("SNYK_API", srv.URL)

	restore := network.SetTestClient(func() network.Client {
		return &mockHTTPClient{
			doFunc: func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultClient.Do(req)
			},
		}
	})
	defer restore()

	ctx := context.Background()
	err := UpdateProjectBranch(ctx, "org-123", "proj-123", "main")

	if err != nil {
		t.Fatalf("UpdateProjectBranch() error = %v", err)
	}
}
