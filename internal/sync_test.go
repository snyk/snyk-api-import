package internal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/go-github/v57/github"
	"github.com/snyk/snyk-api-import/internal/security"
	"golang.org/x/oauth2"
)

// ============================================================================
// Helpers
// ============================================================================

// createGitHubClient creates an authenticated GitHub client using a Personal Access Token
// Moved from github.go as it's only used in tests
func createGitHubClient(ctx context.Context, auth GitHubAuth) (*github.Client, error) {
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: auth.Token},
	)
	tc := oauth2.NewClient(ctx, ts)

	var client *github.Client
	if auth.BaseURL != "" && auth.BaseURL != "https://api.github.com" {
		// GitHub Enterprise
		var err error
		client, err = github.NewClient(tc).WithEnterpriseURLs(auth.BaseURL, auth.BaseURL)
		if err != nil {
			return nil, fmt.Errorf("create GitHub Enterprise client: %w", err)
		}
	} else {
		// GitHub.com
		client = github.NewClient(tc)
	}

	return client, nil
}

// Helper to convert []map[string]string to []map[string]interface{}
func toIfaceMaps(in []map[string]string) []map[string]interface{} {
	out := make([]map[string]interface{}, len(in))
	for i, m := range in {
		mm := make(map[string]interface{})
		for k, v := range m {
			mm[k] = v
		}
		out[i] = mm
	}
	return out
}

// Small helpers used in test functions
func indexOf(s, sep string) int {
	for i := 0; i+len(sep) <= len(s); i++ {
		if s[i:i+len(sep)] == sep {
			return i
		}
	}
	return -1
}

func splitOnce(s, sep string) []string {
	if idx := indexOf(s, sep); idx != -1 {
		return []string{s[:idx], s[idx+1:]}
	}
	return []string{s}
}

func contains(s, sub string) bool {
	return indexOf(s, sub) != -1
}

// ============================================================================
// Sync State Comparison Tests
// ============================================================================

func TestCompareStates_UnitCases(t *testing.T) {
	manifestTypes := []string{"pom.xml", "package.json", "requirements.txt", "Dockerfile"}

	tests := []struct {
		name      string
		snyk      []map[string]string
		bb        []map[string]string
		wantMiss  int
		wantStale int
		wantEmpty int
	}{
		{
			name:      "exact match",
			snyk:      []map[string]string{{"owner": "o", "name": "r", "branch": "main", "manifest": "pom.xml"}},
			bb:        []map[string]string{{"owner": "o", "name": "r", "branch": "main", "manifest": "pom.xml"}},
			wantMiss:  0,
			wantStale: 0,
			wantEmpty: 0,
		},
		{
			name:      "missing in snyk",
			snyk:      []map[string]string{{"owner": "o", "name": "r1", "branch": "main", "manifest": "pom.xml"}},
			bb:        []map[string]string{{"owner": "o", "name": "r1", "branch": "main", "manifest": "pom.xml"}, {"owner": "o", "name": "r2", "branch": "main", "manifest": "package.json"}},
			wantMiss:  1,
			wantStale: 0,
			wantEmpty: 0,
		},
		{
			name:      "branch mismatch creates branch update",
			snyk:      []map[string]string{{"owner": "o", "name": "r", "branch": "dev", "manifest": "package.json"}},
			bb:        []map[string]string{{"owner": "o", "name": "r", "branch": "main", "manifest": "package.json"}},
			wantMiss:  0, // Branch updates handled separately, not in missing
			wantStale: 0, // Branch updates handled separately, not in stale
			wantEmpty: 0,
		},
		{
			name:      "importable empty manifest",
			snyk:      []map[string]string{{"owner": "o", "name": "r", "branch": "main", "manifest": ""}},
			bb:        []map[string]string{{"owner": "o", "name": "r", "branch": "main", "manifest": ""}},
			wantMiss:  0,
			wantStale: 0,
			wantEmpty: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := toIfaceMaps(tc.snyk)
			b := toIfaceMaps(tc.bb)
			res := CompareStates(s, b, manifestTypes)
			if len(res.Missing) != tc.wantMiss {
				t.Fatalf("%s: want missing %d got %d", tc.name, tc.wantMiss, len(res.Missing))
			}
			if len(res.Stale) != tc.wantStale {
				t.Fatalf("%s: want stale %d got %d", tc.name, tc.wantStale, len(res.Stale))
			}
			if len(res.ImportableEmpty) != tc.wantEmpty {
				t.Fatalf("%s: want importableEmpty %d got %d", tc.name, tc.wantEmpty, len(res.ImportableEmpty))
			}
		})
	}
}

// TestBuildPlannedActions exercises the action-building logic used by SyncBitbucketCloudApp
// without making any network calls. It recreates the portion of the sync flow that
// converts CompareStates results and existing Snyk projects into planned actions.
func TestBuildPlannedActions(t *testing.T) {
	// Snyk has projects for petclinic and supplements (on master), and a project for snyk-scmrepo-to-snyk on main
	snykProjects := []map[string]interface{}{
		{"name": "robhicksiii/petclinic:petclinic/pom.xml", "branch": "", "targetReference": "master", "id": "id1", "type": "project"},
		{"name": "robhicksiii/supplements:pom.xml", "branch": "", "targetReference": "master", "id": "id2", "type": "project"},
		{"name": "robhicksiii/snyk-scmrepo-to-snyk:requirements.txt", "branch": "", "targetReference": "main", "id": "id3", "type": "project"},
	}

	// Bitbucket reports repos (owner/name/branch/manifest)
	bitbucket := []map[string]interface{}{
		{"owner": "robhicksiii", "name": "goof", "branch": "main", "manifest": "package.json"},
		{"owner": "robhicksiii", "name": "nodejs-goof", "branch": "snyk-fix-f79197ef6d879e19f21688e02576850f", "manifest": "package.json"},
		{"owner": "robhicksiii", "name": "nodejs-goof", "branch": "snyk-fix-f79197ef6d879e19f21688e02576850f", "manifest": "Dockerfile"},
		{"owner": "robhicksiii", "name": "petclinic", "branch": "master", "manifest": "petclinic/pom.xml"},
		{"owner": "robhicksiii", "name": "supplements", "branch": "master", "manifest": "pom.xml"},
		{"owner": "robhicksiii", "name": "snyk-scmrepo-to-snyk", "branch": "feature/dev", "manifest": "requirements.txt"},
	}

	manifestTypes := []string{"pom.xml", "package.json", "requirements.txt", "Dockerfile"}

	res := CompareStates(snykProjects, bitbucket, manifestTypes)

	// Build snykRepoBranches from snykProjects similar to SyncBitbucketCloudApp
	snykRepoBranches := map[string]map[string]bool{}
	for _, p := range snykProjects {
		pname := fmt.Sprintf("%v", p["name"])
		owner := ""
		repo := ""
		if idx := indexOf(pname, ":"); idx != -1 {
			// split owner/repo:manifest
			left := pname[:idx]
			if parts := splitOnce(left, "/"); len(parts) == 2 {
				owner = parts[0]
				repo = parts[1]
			} else {
				repo = left
			}
		} else if parts := splitOnce(pname, "/"); len(parts) == 2 {
			owner = parts[0]
			repo = parts[1]
		} else {
			repo = pname
		}
		if owner == "" || owner == "<nil>" {
			continue
		}
		branch := fmt.Sprintf("%v", p["branch"])
		if tr, ok := p["targetReference"]; ok {
			trStr := fmt.Sprintf("%v", tr)
			if trStr != "" && trStr != "<nil>" {
				branch = trStr
			}
		}
		if branch == "" || branch == "<nil>" {
			branch = "main"
		}
		key := owner + "/" + repo
		if _, ok := snykRepoBranches[key]; !ok {
			snykRepoBranches[key] = map[string]bool{}
		}
		snykRepoBranches[key][branch] = true
	}

	// Now build planned actions from res.Missing, skipping ones that already exist in snykRepoBranches
	actions := []string{}
	for _, r := range res.Missing {
		name := fmt.Sprintf("%v", r["name"])
		owner := fmt.Sprintf("%v", r["owner"])
		branch := fmt.Sprintf("%v", r["branch"])
		if owner == "" || owner == "<nil>" {
			actions = append(actions, fmt.Sprintf("Would import repo '%s' to org '%s' (branch: %s)", name, "ORG", branch))
			continue
		}
		key := owner + "/" + name
		if branches, ok := snykRepoBranches[key]; ok {
			if branches[branch] {
				// skip
				continue
			}
		}
		actions = append(actions, fmt.Sprintf("Would import repo '%s' to org '%s' (branch: %s)", key, "ORG", branch))
	}

	// Expect certain planned imports from the real-world data scenario
	if len(actions) == 0 {
		t.Fatalf("expected planned actions but got none")
	}
	// Ensure specific expected repos are planned (goof and snyk-scmrepo-to-snyk)
	want := map[string]bool{"robhicksiii/goof": false, "robhicksiii/snyk-scmrepo-to-snyk": false}
	for _, a := range actions {
		for k := range want {
			if contains(a, k) {
				want[k] = true
			}
		}
	}
	for k, v := range want {
		if !v {
			t.Errorf("expected action containing %s not found in actions: %v", k, actions)
		}
	}
}

// ============================================================================
// Sync Normalization Tests
// ============================================================================

func TestNormalizeSnykAttributes(t *testing.T) {
	manifestTypes := []string{"**/package.json", "package.json"}

	t.Run("camelCase targetFile/targetReference", func(t *testing.T) {
		attrs := map[string]interface{}{
			"name":            "owner/repo",
			"targetReference": "feature/abc",
			"targetFile":      "path/to/package.json",
		}
		branch, manifest, tr, include := normalizeSnykAttributes(attrs, "owner/repo", manifestTypes)
		if !include {
			t.Fatalf("expected include=true, got false")
		}
		if branch != "feature/abc" {
			t.Fatalf("unexpected branch: %q", branch)
		}
		if manifest != "path/to/package.json" {
			t.Fatalf("unexpected manifest: %q", manifest)
		}
		if tr != "feature/abc" {
			t.Fatalf("unexpected targetReference: %q", tr)
		}
	})

	t.Run("snake_case target_file/target_reference", func(t *testing.T) {
		attrs := map[string]interface{}{
			"name":             "owner/repo",
			"target_reference": "feature/xyz",
			"target_file":      "path/to/package.json",
		}
		branch, manifest, tr, include := normalizeSnykAttributes(attrs, "owner/repo", manifestTypes)
		if !include {
			t.Fatalf("expected include=true, got false")
		}
		if branch != "feature/xyz" {
			t.Fatalf("unexpected branch: %q", branch)
		}
		if manifest != "path/to/package.json" {
			t.Fatalf("unexpected manifest: %q", manifest)
		}
		if tr != "feature/xyz" {
			t.Fatalf("unexpected targetReference: %q", tr)
		}
	})

	t.Run("manifest filtering excludes non-matching", func(t *testing.T) {
		attrs := map[string]interface{}{
			"name":            "owner/repo",
			"targetReference": "feature/abc",
			"targetFile":      "README.md",
		}
		_, _, _, include := normalizeSnykAttributes(attrs, "owner/repo", manifestTypes)
		if include {
			t.Fatalf("expected include=false for non-matching manifest, got true")
		}
	})
}

// ============================================================================
// Sync Lifecycle Tests
// ============================================================================

type rtBlock struct{}

func (rtBlock) RoundTrip(req *http.Request) (*http.Response, error) {
	<-req.Context().Done()
	return nil, req.Context().Err()
}

// TestSyncCancellation verifies that SyncBitbucketCloudApp returns
// promptly with context.Canceled when the provided context is cancelled while
// a network call is in-flight. This uses security.SetTestHTTPClient to inject
// an httptest client and SNYK_TEST_SKIP_URL_VALIDATION to bypass host checks.
func TestSyncCancellation(t *testing.T) {
	// Prepare an httptest server whose handler blocks until the request's
	// context is done (simulating a long-running upstream request).
	client := &http.Client{Transport: rtBlock{}}

	// Bypass URL validation for test transport
	t.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	// Install test client into security package and ensure restore at end.
	restore := security.SetTestHTTPClient(client, []string{"api.bitbucket.org"})
	defer restore()

	// Set required environment variables so SyncBitbucketCloudApp advances to
	// the network call (FetchBitbucketAppToken). Use a temp dir for logs.
	tdir := t.TempDir()
	t.Setenv("SNYK_LOG_PATH", tdir)
	t.Setenv("SNYK_TOKEN", "dummy")
	t.Setenv("ORG_ID", "org-1")
	t.Setenv("BITBUCKET_APP_CLIENT_ID", "cid")
	t.Setenv("BITBUCKET_APP_CLIENT_SECRET", "csecret")

	// Use a cancellable context and call the wrapper which runs Sync in a
	// goroutine. We expect the wrapper to return ctx.Err() when we cancel.
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- SyncBitbucketCloudApp(ctx, "", "", "", true, tdir, false, true)
	}()
	// Give the goroutine a short moment to start then cancel the context
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context.Canceled, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timeout waiting for SyncBitbucketCloudApp to return after cancel")
	}
}

// ============================================================================
// GitHub Sync Tests
// ============================================================================

func TestFetchGitHubRepos_Basic(t *testing.T) {
	// Note: FetchGitHubRepos uses the go-github library which makes real HTTP calls
	// For comprehensive testing, we'd need to mock the entire github.Client
	// For now, we test that the function signature and basic error handling work

	ctx := context.Background()
	auth := GitHubAuth{
		Token:   "test-token",
		BaseURL: "https://api.github.com",
	}

	// This will fail with auth error, which is expected
	_, err := FetchGitHubRepos(ctx, auth, "nonexistent-org", nil)

	// We expect an error due to invalid token
	if err == nil {
		t.Error("Expected error with invalid token, got nil")
	}
}

func TestGetStringValue(t *testing.T) {
	tests := []struct {
		name  string
		input *string
		want  string
	}{
		{
			name:  "nil pointer",
			input: nil,
			want:  "",
		},
		{
			name:  "empty string",
			input: stringPtr(""),
			want:  "",
		},
		{
			name:  "non-empty string",
			input: stringPtr("test-value"),
			want:  "test-value",
		},
		{
			name:  "string with spaces",
			input: stringPtr("  value with spaces  "),
			want:  "  value with spaces  ",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getStringValue(tt.input)
			if got != tt.want {
				t.Errorf("getStringValue() = %q, want %q", got, tt.want)
			}
		})
	}
}

// Helper function for tests
func stringPtr(s string) *string {
	return &s
}

func TestCreateGitHubClient_InvalidURL(t *testing.T) {
	ctx := context.Background()
	auth := GitHubAuth{
		Token:   "test-token",
		BaseURL: "://invalid-url",
	}

	_, err := createGitHubClient(ctx, auth)
	if err == nil {
		t.Error("Expected error for invalid URL, got nil")
	}
}

func TestCreateGitHubClient_DefaultURL(t *testing.T) {
	ctx := context.Background()
	auth := GitHubAuth{
		Token:   "test-token",
		BaseURL: "",
	}

	client, err := createGitHubClient(ctx, auth)
	if err != nil {
		t.Fatalf("createGitHubClient() with empty BaseURL should not error: %v", err)
	}

	if client == nil {
		t.Error("Expected non-nil client")
	}
}

func TestCreateGitHubClient_CustomURL(t *testing.T) {
	ctx := context.Background()
	auth := GitHubAuth{
		Token:   "test-token",
		BaseURL: "https://github.company.com/api/v3",
	}

	client, err := createGitHubClient(ctx, auth)
	if err != nil {
		t.Fatalf("createGitHubClient() with custom URL error: %v", err)
	}

	if client == nil {
		t.Error("Expected non-nil client for custom URL")
	}
}
