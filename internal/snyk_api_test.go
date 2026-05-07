package internal

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sam1el/snyk-api-import-go/internal/network"
	"github.com/sam1el/snyk-api-import-go/internal/security"
)

// ============================================================================
// Regional Endpoint Helper Tests
// ============================================================================

func TestGetSnykAPIBaseURL(t *testing.T) {
	tests := []struct {
		name       string
		snykAPI    string
		snykAPIURL string
		expected   string
	}{
		{
			name:       "default US-01",
			snykAPI:    "",
			snykAPIURL: "",
			expected:   "https://api.snyk.io",
		},
		{
			name:       "SNYK_API US-02",
			snykAPI:    "https://api.us.snyk.io",
			snykAPIURL: "",
			expected:   "https://api.us.snyk.io",
		},
		{
			name:       "SNYK_API EU-01",
			snykAPI:    "https://api.eu.snyk.io",
			snykAPIURL: "",
			expected:   "https://api.eu.snyk.io",
		},
		{
			name:       "SNYK_API AU-01",
			snykAPI:    "https://api.au.snyk.io",
			snykAPIURL: "",
			expected:   "https://api.au.snyk.io",
		},
		{
			name:       "SNYK_API_URL fallback",
			snykAPI:    "",
			snykAPIURL: "https://api.eu.snyk.io",
			expected:   "https://api.eu.snyk.io",
		},
		{
			name:       "SNYK_API takes precedence",
			snykAPI:    "https://api.us.snyk.io",
			snykAPIURL: "https://api.eu.snyk.io",
			expected:   "https://api.us.snyk.io",
		},
		{
			name:       "trailing slash removed",
			snykAPI:    "https://api.us.snyk.io/",
			snykAPIURL: "",
			expected:   "https://api.us.snyk.io",
		},
		{
			name:       "custom on-prem URL",
			snykAPI:    "https://snyk.mycompany.com/api",
			snykAPIURL: "",
			expected:   "https://snyk.mycompany.com/api",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clean environment
			os.Unsetenv("SNYK_API")
			os.Unsetenv("SNYK_API_URL")

			// Set test values
			if tt.snykAPI != "" {
				t.Setenv("SNYK_API", tt.snykAPI)
			}
			if tt.snykAPIURL != "" {
				t.Setenv("SNYK_API_URL", tt.snykAPIURL)
			}

			result := GetSnykAPIBaseURL()
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestIsValidSnykAPIURL(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		snykAPI  string
		expected bool
	}{
		// Valid regional endpoints
		{
			name:     "US-01 v1 endpoint",
			url:      "https://api.snyk.io/v1/org/123/projects",
			expected: true,
		},
		{
			name:     "US-02 v1 endpoint",
			url:      "https://api.us.snyk.io/v1/org/123/projects",
			expected: true,
		},
		{
			name:     "EU-01 REST endpoint",
			url:      "https://api.eu.snyk.io/rest/orgs/123/projects",
			expected: true,
		},
		{
			name:     "AU-01 v1 endpoint",
			url:      "https://api.au.snyk.io/v1/group/456/orgs",
			expected: true,
		},
		{
			name:     "future region api.*.snyk.io pattern",
			url:      "https://api.future-region.snyk.io/v1/org/123",
			expected: true,
		},
		// Invalid endpoints
		{
			name:     "non-Snyk domain",
			url:      "https://evil.com/v1/org/123",
			expected: false,
		},
		{
			name:     "api prefix but not Snyk domain",
			url:      "https://api.malicious.com/v1/org/123",
			expected: false,
		},
		{
			name:     "http instead of https",
			url:      "http://api.snyk.io/v1/org/123",
			expected: false,
		},
		{
			name:     "missing api prefix",
			url:      "https://snyk.io/v1/org/123",
			expected: false,
		},
		// Custom SNYK_API allows any URL
		{
			name:     "test server with SNYK_API set",
			url:      "http://localhost:8080/v1/org/123",
			snykAPI:  "http://localhost:8080",
			expected: true,
		},
		{
			name:     "on-prem with SNYK_API set",
			url:      "https://snyk.mycompany.com/api/v1/org/123",
			snykAPI:  "https://snyk.mycompany.com/api",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clean environment
			os.Unsetenv("SNYK_API")

			// Set SNYK_API if specified (allows test URLs)
			if tt.snykAPI != "" {
				t.Setenv("SNYK_API", tt.snykAPI)
			}

			result := IsValidSnykAPIURL(tt.url)
			if result != tt.expected {
				t.Errorf("expected %v, got %v for URL %q", tt.expected, result, tt.url)
			}
		})
	}
}

// ============================================================================
// Project Deactivation Tests
// ============================================================================

func TestDeactivateProject_Success(t *testing.T) {
	// Create a test server that expects a POST to /org/{org}/project/{proj}/deactivate
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		// basic path check
		if !strings.HasSuffix(r.URL.Path, "/deactivate") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		// drain body if present
		_, _ = io.ReadAll(r.Body)
		_ = r.Body.Close()
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	// Inject test client and env
	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()

	// Allow test to bypass URL host validation
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")

	if err := DeactivateProject(context.Background(), "org123", "proj456"); err != nil {
		t.Fatalf("DeactivateProject failed: %v", err)
	}
}

// ============================================================================
// Bulk Project Deactivation Tests
// ============================================================================

func TestBulkDeactivateProjects_DryRun(t *testing.T) {
	ids := []string{"p1", "p2", "p3"}
	res, err := BulkDeactivateProjects(context.Background(), "org1", ids, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Success) != len(ids) {
		t.Fatalf("expected success list of len %d, got %d", len(ids), len(res.Success))
	}
}

func TestBulkDeactivateProjects_AllSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "tok")
	defer os.Unsetenv("SNYK_TOKEN")

	ids := []string{"p1", "p2", "p3", "p4"}
	res, err := BulkDeactivateProjects(context.Background(), "org1", ids, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Success) != len(ids) {
		t.Fatalf("expected all successes, got %d successes, %d failed", len(res.Success), len(res.Failed))
	}
}

func TestBulkDeactivateProjects_PartialFailureAndRetry(t *testing.T) {
	// simulate: first call returns 429, then 200
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&callCount, 1)
		if count%2 == 1 {
			// first attempt for each project: return 429
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`rate limited`))
			return
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "tok")
	defer os.Unsetenv("SNYK_TOKEN")

	ids := []string{"p1", "p2"}
	// set a slightly larger timeout to allow retries/backoff in test
	time.Sleep(10 * time.Millisecond)
	res, err := BulkDeactivateProjects(context.Background(), "org1", ids, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Success) != len(ids) {
		// allow some failures if retries exhausted
		t.Fatalf("expected successes for retried calls; successes=%d failures=%d", len(res.Success), len(res.Failed))
	}
}

// ============================================================================
// Organization Creation Tests
// ============================================================================

func TestCreateOrg_Success(t *testing.T) {
	// Start a test server that validates the request and returns a 201 JSON body
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Validate Authorization header
		if got := r.Header.Get("Authorization"); got == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		// Read and validate body
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad body", http.StatusBadRequest)
			return
		}
		resp := map[string]string{"id": "created-123", "name": body["name"].(string)}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	// Inject a network test client that points to the test server
	restore := network.SetTestClient(func() network.Client {
		return &testClient{c: ts.Client()}
	})
	defer restore()

	// Point code at our test server
	os.Setenv("SNYK_API", ts.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "tok")
	defer os.Unsetenv("SNYK_TOKEN")

	out, err := CreateOrg(context.Background(), "42", "my-org", "")
	if err != nil {
		t.Fatalf("CreateOrg returned error: %v", err)
	}
	if id, ok := out["id"].(string); !ok || id != "created-123" {
		t.Fatalf("unexpected id in response: %#v", out)
	}
}

// testClient adapts an *http.Client to the network.Client interface used by
// the package. It simply forwards Do calls.
type testClient struct {
	c *http.Client
}

func (tc *testClient) Do(req *http.Request) (*http.Response, error) {
	return tc.c.Do(req)
}

// ==============================================================================
// ListTargets Tests
// ==============================================================================

func TestListTargets_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check method and auth (note: code uses "Token " with capital T)
		if r.Method != "GET" {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Token ") {
			t.Fatalf("expected 'Token' auth header, got: %s", authHeader)
		}

		// Check path format
		if !strings.Contains(r.URL.Path, "/v1/org/") || !strings.Contains(r.URL.Path, "/targets") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		w.WriteHeader(200)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": [
				{
					"id": "target-123",
					"type": "target",
					"attributes": {
						"displayName": "test-org/test-repo",
						"origin": "github"
					}
				}
			]
		}`))
	}))
	defer srv.Close()

	// Inject test client
	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()

	// Need to inject network client as well
	restoreNet := network.SetTestClient(func() network.Client {
		return &testClient{c: srv.Client()}
	})
	defer restoreNet()

	// Set env vars
	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	targets, err := ListTargets(context.Background(), "org123", "")
	if err != nil {
		t.Fatalf("ListTargets failed: %v", err)
	}

	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
}

func TestListTargets_WithOriginFilter(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check that origin parameter is present
		origin := r.URL.Query().Get("origin")
		if origin != "github" {
			t.Fatalf("expected origin=github, got: %s", origin)
		}

		w.WriteHeader(200)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data": []}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	restoreNet := network.SetTestClient(func() network.Client {
		return &testClient{c: srv.Client()}
	})
	defer restoreNet()

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	_, err := ListTargets(context.Background(), "org123", "github")
	if err != nil {
		t.Fatalf("ListTargets failed: %v", err)
	}
}

func TestListTargets_EmptyOrgId(t *testing.T) {
	_, err := ListTargets(context.Background(), "", "")
	if err == nil {
		t.Fatal("expected error for empty orgID")
	}
	if !strings.Contains(err.Error(), "orgID cannot be empty") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListTargets_InvalidOrgId(t *testing.T) {
	tests := []struct {
		name  string
		orgID string
	}{
		{"with spaces", "org 123"},
		{"with special chars", "org@123"},
		{"with slash", "org/123"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ListTargets(context.Background(), tt.orgID, "")
			if err == nil {
				t.Fatal("expected error for invalid orgID")
			}
			if !strings.Contains(err.Error(), "invalid orgID format") {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestListTargets_MissingToken(t *testing.T) {
	// Ensure tokens are not set
	os.Unsetenv("SNYK_TOKEN")
	os.Unsetenv("SNYK_API_TOKEN")

	_, err := ListTargets(context.Background(), "org123", "")
	if err == nil {
		t.Fatal("expected error for missing token")
	}
	if !strings.Contains(err.Error(), "environment variable not set") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListTargets_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(403)
		_, _ = w.Write([]byte(`{"message": "Forbidden"}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	restoreNet := network.SetTestClient(func() network.Client {
		return &testClient{c: srv.Client()}
	})
	defer restoreNet()

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	_, err := ListTargets(context.Background(), "org123", "")
	if err == nil {
		t.Fatal("expected error for API failure")
	}
}

// ==============================================================================
// CreateOrg Tests (Additional Coverage)
// ==============================================================================

func TestCreateOrg_EmptyGroupId(t *testing.T) {
	_, err := CreateOrg(context.Background(), "", "Test Org", "github")
	if err == nil {
		t.Fatal("expected error for empty groupID")
	}
	if !strings.Contains(err.Error(), "groupId and name are required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateOrg_EmptyOrgName(t *testing.T) {
	_, err := CreateOrg(context.Background(), "group123", "", "github")
	if err == nil {
		t.Fatal("expected error for empty org name")
	}
	if !strings.Contains(err.Error(), "groupId and name are required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// ==============================================================================
// ListIntegrations Tests
// ==============================================================================

func TestListIntegrations_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Token ") {
			t.Fatalf("expected 'Token' auth header, got: %s", authHeader)
		}

		// Check path
		if !strings.Contains(r.URL.Path, "/v1/org/") || !strings.Contains(r.URL.Path, "/integrations") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		w.WriteHeader(200)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"github": "integration-id-123",
			"gitlab": "integration-id-456"
		}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	restoreNet := network.SetTestClient(func() network.Client {
		return &testClient{c: srv.Client()}
	})
	defer restoreNet()

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	integrations, err := ListIntegrations(context.Background(), "org123")
	if err != nil {
		t.Fatalf("ListIntegrations failed: %v", err)
	}

	if len(integrations) != 2 {
		t.Fatalf("expected 2 integrations, got %d", len(integrations))
	}

	if integrations["github"] != "integration-id-123" {
		t.Fatalf("unexpected github integration ID: %s", integrations["github"])
	}
}

func TestListIntegrations_EmptyOrgId(t *testing.T) {
	_, err := ListIntegrations(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty orgID")
	}
	if !strings.Contains(err.Error(), "orgID cannot be empty") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListIntegrations_InvalidOrgId(t *testing.T) {
	tests := []struct {
		name  string
		orgID string
	}{
		{"with spaces", "org 123"},
		{"with special chars", "org@123"},
		{"with slash", "org/123"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ListIntegrations(context.Background(), tt.orgID)
			if err == nil {
				t.Fatal("expected error for invalid orgID")
			}
			if !strings.Contains(err.Error(), "invalid orgID format") {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestListIntegrations_MissingToken(t *testing.T) {
	os.Unsetenv("SNYK_TOKEN")
	os.Unsetenv("SNYK_API_TOKEN")

	_, err := ListIntegrations(context.Background(), "org123")
	if err == nil {
		t.Fatal("expected error for missing token")
	}
	if !strings.Contains(err.Error(), "environment variable not set") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListIntegrations_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write([]byte(`{"message": "Org not found"}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	restoreNet := network.SetTestClient(func() network.Client {
		return &testClient{c: srv.Client()}
	})
	defer restoreNet()

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	_, err := ListIntegrations(context.Background(), "org123")
	if err == nil {
		t.Fatal("expected error for API failure")
	}
	if !strings.Contains(err.Error(), "unexpected status: 404") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListIntegrations_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	restoreNet := network.SetTestClient(func() network.Client {
		return &testClient{c: srv.Client()}
	})
	defer restoreNet()

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "testtoken")
	defer os.Unsetenv("SNYK_TOKEN")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	integrations, err := ListIntegrations(context.Background(), "org123")
	if err != nil {
		t.Fatalf("ListIntegrations failed: %v", err)
	}

	if len(integrations) != 0 {
		t.Fatalf("expected 0 integrations, got %d", len(integrations))
	}
}

// ============================================================================
// Organization Listing Tests (FetchSnykOrgs)
// ============================================================================
// Note: Uses mockHTTPClient from sync_snyk_test.go

func TestFetchSnykOrgs_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request
		if r.Header.Get("Authorization") != "Token test-token" {
			t.Errorf("Expected Authorization 'Token test-token', got %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Accept") != "application/json" {
			t.Errorf("Expected Accept 'application/json', got %q", r.Header.Get("Accept"))
		}

		// Verify path
		expectedPath := "/v1/group/12345/orgs"
		if r.URL.Path != expectedPath {
			t.Errorf("Expected path %q, got %q", expectedPath, r.URL.Path)
		}

		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{
			"id": "12345",
			"name": "Test Group",
			"orgs": [
				{
					"id": "org-1",
					"name": "Org One",
					"slug": "org-one",
					"url": "https://app.snyk.io/org/org-one",
					"created": "2023-01-01T00:00:00Z"
				},
				{
					"id": "org-2",
					"name": "Org Two",
					"slug": "org-two",
					"url": "https://app.snyk.io/org/org-two",
					"created": "2023-01-02T00:00:00Z"
				}
			]
		}`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "test-token")
	// Use a valid-looking API URL that will be rewritten by the mock client
	t.Setenv("SNYK_API", "https://api.test.snyk.io")

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
	orgs, err := FetchSnykOrgs(ctx, "12345")

	if err != nil {
		t.Fatalf("FetchSnykOrgs() error = %v", err)
	}

	if len(orgs) != 2 {
		t.Errorf("Expected 2 orgs, got %d", len(orgs))
	}

	// Verify first org
	if orgs[0].ID != "org-1" {
		t.Errorf("Expected first org ID 'org-1', got %q", orgs[0].ID)
	}
	if orgs[0].Name != "Org One" {
		t.Errorf("Expected first org name 'Org One', got %q", orgs[0].Name)
	}
	if orgs[0].Slug != "org-one" {
		t.Errorf("Expected first org slug 'org-one', got %q", orgs[0].Slug)
	}
	if orgs[0].GroupID != "12345" {
		t.Errorf("Expected first org GroupId '12345', got %q", orgs[0].GroupID)
	}

	// Verify second org
	if orgs[1].ID != "org-2" {
		t.Errorf("Expected second org ID 'org-2', got %q", orgs[1].ID)
	}
	if orgs[1].Name != "Org Two" {
		t.Errorf("Expected second org name 'Org Two', got %q", orgs[1].Name)
	}
}

func TestFetchSnykOrgs_EmptyGroupId(t *testing.T) {
	ctx := context.Background()
	_, err := FetchSnykOrgs(ctx, "")

	if err == nil {
		t.Error("Expected error for empty groupID, got nil")
	} else if !strings.Contains(err.Error(), "groupId cannot be empty") {
		t.Errorf("Expected error about empty groupID, got %q", err.Error())
	}
}

func TestFetchSnykOrgs_InvalidGroupId(t *testing.T) {
	tests := []struct {
		name    string
		groupID string
	}{
		{"non-hex alphabetic", "ghijk123"}, // g-z are not valid hex
		{"special characters", "123@456"},  // @ is not valid
		{"sql injection attempt", "123' OR '1'='1"},
		{"path traversal attempt", "../../../etc/passwd"},
		{"with slash", "123/456"},
		{"with dot", "123.456"},
		{"with spaces", "123 456"},
		{"with underscore", "123_456"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			_, err := FetchSnykOrgs(ctx, tt.groupID)

			if err == nil {
				t.Errorf("Expected error for invalid groupID %q, got nil", tt.groupID)
			} else if !strings.Contains(err.Error(), "invalid groupID format") {
				t.Errorf("Expected error about invalid groupID, got %q", err.Error())
			}
		})
	}
}

func TestFetchSnykOrgs_MissingToken(t *testing.T) {
	t.Setenv("SNYK_TOKEN", "")
	t.Setenv("SNYK_API_TOKEN", "")

	ctx := context.Background()
	_, err := FetchSnykOrgs(ctx, "12345")

	if err == nil {
		t.Error("Expected error for missing token, got nil")
	} else if !strings.Contains(err.Error(), "SNYK_TOKEN or SNYK_API_TOKEN") {
		t.Errorf("Expected error about missing token, got %q", err.Error())
	}
}

func TestFetchSnykOrgs_TokenFallback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify it uses the fallback token
		if r.Header.Get("Authorization") != "Token fallback-token" {
			t.Errorf("Expected Authorization 'Token fallback-token', got %q", r.Header.Get("Authorization"))
		}

		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"id": "12345", "orgs": []}`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "")
	t.Setenv("SNYK_API_TOKEN", "fallback-token")
	// Use a valid-looking API URL that will be rewritten by the mock client
	t.Setenv("SNYK_API", "https://api.test.snyk.io")

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
	_, err := FetchSnykOrgs(ctx, "12345")

	if err != nil {
		t.Fatalf("FetchSnykOrgs() with fallback token error = %v", err)
	}
}

func TestFetchSnykOrgs_ErrorHandling(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		body       string
	}{
		{"unauthorized", 401, `{"message":"Unauthorized"}`},
		{"forbidden", 403, `{"message":"Forbidden"}`},
		{"not found", 404, `{"message":"Group not found"}`},
		{"server error", 500, `{"message":"Internal error"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			t.Setenv("SNYK_TOKEN", "test-token")
			// Use a valid-looking API URL that will be rewritten by the mock client
			t.Setenv("SNYK_API", "https://api.test.snyk.io")

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
			_, err := FetchSnykOrgs(ctx, "12345")

			if err == nil {
				t.Errorf("Expected error for status %d, got nil", tt.statusCode)
			}
		})
	}
}

func TestFetchSnykOrgs_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{invalid json`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "test-token")
	// Use a valid-looking API URL that will be rewritten by the mock client
	t.Setenv("SNYK_API", "https://api.test.snyk.io")

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
	_, err := FetchSnykOrgs(ctx, "12345")

	if err == nil {
		t.Error("Expected error for invalid JSON, got nil")
	}
}

func TestFetchSnykOrgs_EmptyOrgs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"id": "12345", "name": "Test Group", "orgs": []}`))
	}))
	defer srv.Close()

	t.Setenv("SNYK_TOKEN", "test-token")
	// Use a valid-looking API URL that will be rewritten by the mock client
	t.Setenv("SNYK_API", "https://api.test.snyk.io")

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
	orgs, err := FetchSnykOrgs(ctx, "12345")

	if err != nil {
		t.Fatalf("FetchSnykOrgs() error = %v", err)
	}

	if len(orgs) != 0 {
		t.Errorf("Expected 0 orgs, got %d", len(orgs))
	}
}

func TestFetchSnykOrgs_NumericGroupId(t *testing.T) {
	// Test that valid numeric groupIds work
	validGroupIds := []string{
		"12345",
		"0",
		"999999999",
		"00123", // Leading zeros
	}

	for _, groupID := range validGroupIds {
		t.Run("valid_"+groupID, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(200)
				_, _ = w.Write([]byte(`{"id": "` + groupID + `", "orgs": []}`))
			}))
			defer srv.Close()

			t.Setenv("SNYK_TOKEN", "test-token")
			// Use a valid-looking API URL that will be rewritten by the mock client
			t.Setenv("SNYK_API", "https://api.test.snyk.io")

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
			_, err := FetchSnykOrgs(ctx, groupID)

			if err != nil {
				t.Errorf("FetchSnykOrgs() with valid groupID %q error = %v", groupID, err)
			}
		})
	}
}
