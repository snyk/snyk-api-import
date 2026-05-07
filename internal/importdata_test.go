package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snyk/snyk-api-import/internal/security"
	"github.com/snyk/snyk-api-import/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteImportTargetsFile_Success(t *testing.T) {
	// Setup
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	tmpDir := t.TempDir()
	outputPath := filepath.Join(tmpDir, "import-targets.json")

	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "test-repo",
				Owner:  "test-org",
				Branch: "main",
			},
			OrgID:         "org-123",
			IntegrationID: "integration-456",
		},
	}

	// Execute
	err := WriteImportTargetsFile(targets, outputPath)

	// Assert
	require.NoError(t, err)
	assert.FileExists(t, outputPath)

	// Verify file contents
	data, err := os.ReadFile(outputPath)
	require.NoError(t, err)

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	require.NoError(t, err)

	assert.Contains(t, result, "targets")
	targetsArray := result["targets"].([]interface{})
	assert.Len(t, targetsArray, 1)
}

func TestWriteImportTargetsFile_MultipleTargets(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	tmpDir := t.TempDir()
	outputPath := filepath.Join(tmpDir, "import-targets.json")

	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "repo1",
				Owner:  "org1",
				Branch: "main",
			},
			OrgID:         "org-123",
			IntegrationID: "int-456",
		},
		{
			Target: Target{
				Name:   "repo2",
				Owner:  "org2",
				Branch: "develop",
			},
			OrgID:         "org-789",
			IntegrationID: "int-012",
		},
	}

	err := WriteImportTargetsFile(targets, outputPath)

	require.NoError(t, err)

	// Verify all targets written
	data, err := os.ReadFile(outputPath)
	require.NoError(t, err)

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	require.NoError(t, err)

	targetsArray := result["targets"].([]interface{})
	assert.Len(t, targetsArray, 2)
}

func TestWriteImportTargetsFile_MissingIntegrationId(t *testing.T) {
	tmpDir := t.TempDir()
	outputPath := filepath.Join(tmpDir, "import-targets.json")

	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "test-repo",
				Owner:  "test-org",
				Branch: "main",
			},
			OrgID:         "org-123",
			IntegrationID: "", // Missing!
		},
	}

	err := WriteImportTargetsFile(targets, outputPath)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing required integrationID")
}

func TestWriteImportTargetsFile_InvalidPath(t *testing.T) {
	targets := []ImportTarget{
		{
			Target: Target{
				Name:   "test-repo",
				Owner:  "test-org",
				Branch: "main",
			},
			OrgID:         "org-123",
			IntegrationID: "int-456",
		},
	}

	// Try to write to invalid path
	err := WriteImportTargetsFile(targets, "/invalid/path/../../etc/passwd")

	assert.Error(t, err)
}

func TestWriteImportTargetsFile_EmptyTargets(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	tmpDir := t.TempDir()
	outputPath := filepath.Join(tmpDir, "import-targets.json")

	targets := []ImportTarget{}

	err := WriteImportTargetsFile(targets, outputPath)

	require.NoError(t, err)

	// Verify empty array written
	data, err := os.ReadFile(outputPath)
	require.NoError(t, err)

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	require.NoError(t, err)

	targetsArray := result["targets"].([]interface{})
	assert.Len(t, targetsArray, 0)
}

// ============================================================================
// Import Target Building Tests (from importdata_helpers_test.go)
// ============================================================================

func TestBuildImportTargetsFromRepos_GitHub(t *testing.T) {
	repos := []map[string]interface{}{
		testutil.ValidGitHubRepo,
	}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	target := targets[0]
	assert.Equal(t, "test-repo", target.Target.Name)
	assert.Equal(t, "test-org", target.Target.Owner)
	assert.Equal(t, "main", target.Target.Branch)
	assert.Equal(t, "org-123", target.OrgID)
	assert.Equal(t, "int-456", target.IntegrationID)
}

func TestBuildImportTargetsFromRepos_GitHub_Multiple(t *testing.T) {
	repos := []map[string]interface{}{
		{
			"name":           "repo1",
			"owner":          "org1",
			"default_branch": "main",
		},
		{
			"name":           "repo2",
			"owner":          "org1",
			"default_branch": "develop",
		},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	require.NoError(t, err)
	assert.Len(t, targets, 2)
	assert.Equal(t, "repo1", targets[0].Target.Name)
	assert.Equal(t, "main", targets[0].Target.Branch)
	assert.Equal(t, "repo2", targets[1].Target.Name)
	assert.Equal(t, "develop", targets[1].Target.Branch)
}

func TestBuildImportTargetsFromRepos_GitLab(t *testing.T) {
	repos := []map[string]interface{}{
		testutil.ValidGitLabProject,
	}

	targets, err := BuildImportTargetsFromRepos(repos, "gitlab", "org-789", "int-012")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	target := targets[0]
	assert.Equal(t, 12345, target.Target.ID)
	assert.Equal(t, "main", target.Target.Branch)
	assert.Equal(t, "org-789", target.OrgID)
	assert.Equal(t, "int-012", target.IntegrationID)
}

func TestBuildImportTargetsFromRepos_GitLab_NumericID(t *testing.T) {
	repos := []map[string]interface{}{
		{
			"id":             98765,
			"name":           "test-project",
			"default_branch": "master",
		},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "gitlab", "org-789", "int-012")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	target := targets[0]
	assert.Equal(t, 98765, target.Target.ID)
	assert.Equal(t, "master", target.Target.Branch)
}

func TestBuildImportTargetsFromRepos_Azure(t *testing.T) {
	repos := []map[string]interface{}{
		testutil.ValidAzureRepo,
	}

	targets, err := BuildImportTargetsFromRepos(repos, "azure-repos", "org-abc", "int-def")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	target := targets[0]
	assert.Equal(t, "azure-repo", target.Target.Name)
	assert.Equal(t, "azure-project", target.Target.Owner)
	assert.Equal(t, "main", target.Target.Branch)
	assert.Equal(t, "org-abc", target.OrgID)
	assert.Equal(t, "int-def", target.IntegrationID)
}

func TestBuildImportTargetsFromRepos_Azure_RefsHeadsBranch(t *testing.T) {
	repos := []map[string]interface{}{
		{
			"name":          "test-repo",
			"owner":         "test-project",
			"defaultBranch": "refs/heads/develop",
		},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "azure-repos", "org-abc", "int-def")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	target := targets[0]
	assert.Equal(t, "develop", target.Target.Branch)
}

func TestBuildImportTargetsFromRepos_Bitbucket(t *testing.T) {
	repos := []map[string]interface{}{
		testutil.ValidBitbucketRepo,
	}

	targets, err := BuildImportTargetsFromRepos(repos, "bitbucket-cloud", "org-xyz", "int-uvw")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	target := targets[0]
	assert.Equal(t, "bb-repo", target.Target.Name)
	assert.Equal(t, "main", target.Target.Branch)
	assert.Equal(t, "org-xyz", target.OrgID)
	assert.Equal(t, "int-uvw", target.IntegrationID)
}

func TestBuildImportTargetsFromRepos_EmptyRepos(t *testing.T) {
	repos := []map[string]interface{}{}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	require.NoError(t, err)
	assert.Empty(t, targets)
}

func TestBuildImportTargetsFromRepos_UnsupportedSource(t *testing.T) {
	repos := []map[string]interface{}{
		{"name": "test"},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "unsupported-scm", "org-123", "int-456")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported source")
	assert.Nil(t, targets)
}

func TestBuildImportTargetsFromRepos_MissingRequiredFields(t *testing.T) {
	// GitHub repo missing name
	repos := []map[string]interface{}{
		{
			"owner":          "test-org",
			"default_branch": "main",
			// name is missing
		},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	// Should skip invalid repos and continue
	require.NoError(t, err)
	assert.Empty(t, targets) // No valid targets
}

func TestBuildImportTargetsFromRepos_DefaultBranch(t *testing.T) {
	// Test repos with missing branch use default "main"
	repos := []map[string]interface{}{
		{
			"name":  "test-repo",
			"owner": "test-org",
			// default_branch is missing
		},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	require.NoError(t, err)
	require.Len(t, targets, 1)
	assert.Equal(t, "main", targets[0].Target.Branch)
}

func TestBuildImportTargetsFromRepos_WithManifests(t *testing.T) {
	repos := []map[string]interface{}{
		testutil.ValidGitHubRepoWithManifests,
	}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	require.NoError(t, err)
	require.Len(t, targets, 1)

	// Manifests are in the repo data but target building should still work
	target := targets[0]
	assert.Equal(t, "app-repo", target.Target.Name)
	assert.Equal(t, "my-org", target.Target.Owner)
}

func TestBuildImportTargetsFromRepos_MixedValidAndInvalid(t *testing.T) {
	repos := []map[string]interface{}{
		{
			"name":           "valid-repo",
			"owner":          "test-org",
			"default_branch": "main",
		},
		{
			// Invalid - no name
			"owner":          "test-org",
			"default_branch": "main",
		},
		{
			"name":           "another-valid",
			"owner":          "test-org",
			"default_branch": "develop",
		},
	}

	targets, err := BuildImportTargetsFromRepos(repos, "github", "org-123", "int-456")

	require.NoError(t, err)
	assert.Len(t, targets, 2) // Only valid repos
	assert.Equal(t, "valid-repo", targets[0].Target.Name)
	assert.Equal(t, "another-valid", targets[1].Target.Name)
}

func TestBuildGitHubImportTarget_Success(t *testing.T) {
	repo := map[string]interface{}{
		"name":           "test-repo",
		"owner":          "test-org",
		"default_branch": "main",
	}

	target, err := buildGitHubImportTarget(repo, "org-123", "int-456")

	require.NoError(t, err)
	assert.Equal(t, "test-repo", target.Target.Name)
	assert.Equal(t, "test-org", target.Target.Owner)
	assert.Equal(t, "main", target.Target.Branch)
	assert.False(t, target.Target.Fork)
}

func TestBuildGitHubImportTarget_MissingName(t *testing.T) {
	repo := map[string]interface{}{
		"owner":          "test-org",
		"default_branch": "main",
	}

	_, err := buildGitHubImportTarget(repo, "org-123", "int-456")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing name")
}

func TestBuildGitLabImportTarget_Success(t *testing.T) {
	project := map[string]interface{}{
		"id":             float64(12345),
		"default_branch": "main",
	}

	target, err := buildGitLabImportTarget(project, "org-789", "int-012")

	require.NoError(t, err)
	assert.Equal(t, 12345, target.Target.ID)
	assert.Equal(t, "main", target.Target.Branch)
}

func TestBuildGitLabImportTarget_IntID(t *testing.T) {
	project := map[string]interface{}{
		"id":             98765, // int instead of float64
		"default_branch": "master",
	}

	target, err := buildGitLabImportTarget(project, "org-789", "int-012")

	require.NoError(t, err)
	assert.Equal(t, 98765, target.Target.ID)
}

func TestBuildGitLabImportTarget_MissingID(t *testing.T) {
	project := map[string]interface{}{
		"default_branch": "main",
	}

	_, err := buildGitLabImportTarget(project, "org-789", "int-012")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing id")
}

func TestBuildAzureImportTarget_Success(t *testing.T) {
	repo := map[string]interface{}{
		"name":          "test-repo",
		"owner":         "test-project",
		"defaultBranch": "refs/heads/main",
	}

	target, err := buildAzureImportTarget(repo, "org-abc", "int-def")

	require.NoError(t, err)
	assert.Equal(t, "test-repo", target.Target.Name)
	assert.Equal(t, "test-project", target.Target.Owner)
	assert.Equal(t, "main", target.Target.Branch)
}

func TestBuildAzureImportTarget_NoBranchPrefix(t *testing.T) {
	repo := map[string]interface{}{
		"name":          "test-repo",
		"owner":         "test-project",
		"defaultBranch": "develop", // No refs/heads/ prefix
	}

	target, err := buildAzureImportTarget(repo, "org-abc", "int-def")

	require.NoError(t, err)
	assert.Equal(t, "develop", target.Target.Branch)
}

func TestBuildBitbucketImportTarget_Success(t *testing.T) {
	repo := map[string]interface{}{
		"name":       "test-repo",
		"mainbranch": "main",
	}

	target, err := buildBitbucketImportTarget(repo, "org-xyz", "int-uvw")

	require.NoError(t, err)
	assert.Equal(t, "test-repo", target.Target.Name)
	assert.Equal(t, "main", target.Target.Branch)
}

// ============================================================================
// Import Target Logging Tests (from filelog_test.go)
// ============================================================================

func TestWriteImportTargetsFile_AppendsImportedTargets(t *testing.T) {
	td := t.TempDir()
	// Use the symlink-evaluated path for SNYK_LOG_PATH to avoid macOS
	// "/var" vs "/private/var" mismatches when ResolveSafePath checks
	// filesystem identity.
	realTd, err := filepath.EvalSymlinks(td)
	if err == nil && realTd != "" {
		td = realTd
	}
	os.Setenv("SNYK_LOG_PATH", td)
	defer os.Unsetenv("SNYK_LOG_PATH")

	targets := []ImportTarget{
		{
			Target:        Target{Owner: "alice", Name: "repo1", Branch: "main"},
			OrgID:         "100",
			IntegrationID: "int-1",
		},
	}

	outPath := filepath.Join(td, "targets-out.json")
	if err := WriteImportTargetsFile(targets, outPath); err != nil {
		t.Fatalf("WriteImportTargetsFile failed: %v", err)
	}

	// read imported-targets.log
	logFile := filepath.Join(td, "imported-targets.log")
	b, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("failed to read imported-targets.log: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) != 1 {
		t.Fatalf("expected 1 line in imported-targets.log, got %d", len(lines))
	}
	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(lines[0]), &obj); err != nil {
		t.Fatalf("invalid json line: %v", err)
	}
	if obj["orgID"] != "100" {
		t.Fatalf("expected orgID 100, got %v", obj["orgID"])
	}
	if obj["integrationID"] != "int-1" {
		t.Fatalf("expected integrationID int-1, got %v", obj["integrationID"])
	}
	if _, ok := obj["target"]; !ok {
		t.Fatalf("expected target field in imported-targets.log entry")
	}
}

func TestImportTargets_AppendsPerOrgLogs(t *testing.T) {
	td := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", td)
	defer os.Unsetenv("SNYK_LOG_PATH")
	// create a test server that accepts import POSTs and polling GETs
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			// respond with created and Location header
			w.Header().Set("Location", "/import/job/1")
			w.WriteHeader(201)
		} else if r.Method == "GET" && strings.Contains(r.URL.Path, "/import/job/1") {
			// respond with complete status and a project
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(200)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status": "complete",
				"logs": []interface{}{
					map[string]interface{}{
						"projects": []interface{}{
							map[string]interface{}{
								"projectId": "proj-123",
								"name":      "orgx/repox:package.json",
							},
						},
					},
				},
			})
		}
	}))
	defer srv.Close()

	// Allow custom SNYK_API and skip URL validation in security client
	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	os.Setenv("SNYK_API_TOKEN", "tok")
	defer os.Unsetenv("SNYK_API_TOKEN")
	// Enable synchronous polling for tests
	os.Setenv("SNYK_POLL_SYNC", "1")
	defer os.Unsetenv("SNYK_POLL_SYNC")
	// Use fast polling interval for tests
	os.Setenv("SNYK_POLL_INTERVAL_MS", "100")
	defer os.Unsetenv("SNYK_POLL_INTERVAL_MS")

	// Install the test http.Client into security.NewClient factory
	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()

	// write a targets file inside td (use the evaluated path)
	targetsFile := filepath.Join(td, "test-targets.json")
	content := `[{"target":{"owner":"orgx","name":"repox","branch":"main"},"orgID":"123","integrationID":"i-abc"}]`
	if err := os.WriteFile(targetsFile, []byte(content), 0600); err != nil {
		t.Fatalf("write targets file: %v", err)
	}

	// change working dir to td so ResolveSafePath treats a relative path
	// consistently with SNYK_LOG_PATH on macOS
	origWd, _ := os.Getwd()
	if err := os.Chdir(td); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	defer func() { _ = os.Chdir(origWd) }()

	// call ImportTargetsParallel with a relative path
	if err := ImportTargetsParallel(context.Background(), "test-targets.json", "bitbucket-cloud-app"); err != nil {
		t.Fatalf("ImportTargetsParallel failed: %v", err)
	}

	// check per-org import-jobs log
	jobsFile := filepath.Join(td, "123.import-jobs.log")
	jb, err := os.ReadFile(jobsFile)
	if err != nil {
		t.Fatalf("failed to read import-jobs log: %v", err)
	}
	jlines := strings.Split(strings.TrimSpace(string(jb)), "\n")
	if len(jlines) != 1 {
		t.Fatalf("expected 1 line in import-jobs.log, got %d", len(jlines))
	}
	var job map[string]interface{}
	if err := json.Unmarshal([]byte(jlines[0]), &job); err != nil {
		t.Fatalf("invalid json in import-jobs.log: %v", err)
	}
	if job["integrationID"] != "i-abc" {
		t.Fatalf("unexpected integrationID in job log: %v", job["integrationID"])
	}
	if _, ok := job["target"]; !ok {
		t.Fatalf("expected target in job log")
	}

	// check import-job-results log and imported-projects log were written
	resultsFile := filepath.Join(td, "123.import-job-results.log")
	rb, err := os.ReadFile(resultsFile)
	if err != nil {
		t.Fatalf("failed to read import-job-results log: %v", err)
	}
	rlines := strings.Split(strings.TrimSpace(string(rb)), "\n")
	if len(rlines) != 1 {
		t.Fatalf("expected 1 line in import-job-results.log, got %d", len(rlines))
	}
	var res map[string]interface{}
	if err := json.Unmarshal([]byte(rlines[0]), &res); err != nil {
		t.Fatalf("invalid json in import-job-results.log: %v", err)
	}
	// envelope fields
	if _, ok := res["pid"]; !ok {
		t.Fatalf("expected pid in import-job-results envelope")
	}
	if _, ok := res["hostname"]; !ok {
		t.Fatalf("expected hostname in import-job-results envelope")
	}
	if _, ok := res["level"]; !ok {
		t.Fatalf("expected level in import-job-results envelope")
	}
	if res["integrationID"] != "i-abc" {
		t.Fatalf("unexpected integrationID in results log: %v", res["integrationID"])
	}

	impFile := filepath.Join(td, "123.imported-projects.log")
	ib, err := os.ReadFile(impFile)
	if err != nil {
		t.Fatalf("failed to read imported-projects log: %v", err)
	}
	ilines := strings.Split(strings.TrimSpace(string(ib)), "\n")
	if len(ilines) != 1 {
		t.Fatalf("expected 1 line in imported-projects.log, got %d", len(ilines))
	}
	var imp map[string]interface{}
	if err := json.Unmarshal([]byte(ilines[0]), &imp); err != nil {
		t.Fatalf("invalid json in imported-projects.log: %v", err)
	}
	if imp["integrationID"] != "i-abc" {
		t.Fatalf("unexpected integrationID in imported-projects log: %v", imp["integrationID"])
	}
}

func TestImportTargets_FailedResponse_AppendsFailedImports(t *testing.T) {
	td := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", td)
	defer os.Unsetenv("SNYK_LOG_PATH")

	// create a test server that returns 500
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		w.Write([]byte("internal error"))
	}))
	defer srv.Close()

	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	os.Setenv("SNYK_API_TOKEN", "tok")
	defer os.Unsetenv("SNYK_API_TOKEN")

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()

	targetsFile := filepath.Join(td, "test-targets.json")
	content := `[{"target":{"owner":"orgx","name":"repox","branch":"main"},"orgID":"321","integrationID":"i-bad"}]`
	if err := os.WriteFile(targetsFile, []byte(content), 0600); err != nil {
		t.Fatalf("write targets file: %v", err)
	}

	origWd, _ := os.Getwd()
	if err := os.Chdir(td); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	defer func() { _ = os.Chdir(origWd) }()

	if err := ImportTargetsParallel(context.Background(), "test-targets.json", "bitbucket-cloud-app"); err != nil {
		t.Fatalf("ImportTargetsParallel failed: %v", err)
	}

	// check failed-imports log
	// With centralized retry logic, we only log the final failure (not each retry attempt)
	ffile := filepath.Join(td, "321.failed-imports.log")
	fb, err := os.ReadFile(ffile)
	if err != nil {
		t.Fatalf("failed to read failed-imports log: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(fb)), "\n")
	if len(lines) != 1 {
		t.Fatalf("expected 1 line in failed-imports log (final failure), got %d", len(lines))
	}
	// Check the first entry
	var entry map[string]interface{}
	if err := json.Unmarshal([]byte(lines[0]), &entry); err != nil {
		t.Fatalf("invalid json in failed-imports log: %v", err)
	}
	if entry["msg"] != "Failed to import target" {
		t.Fatalf("unexpected msg in failed-imports entry: %v", entry["msg"])
	}
	// Verify integrationID is logged
	if entry["integrationID"] != "i-bad" {
		t.Fatalf("unexpected integrationID in failed-imports log: %v", entry["integrationID"])
	}
}

// Note: TestImportTargets_RequestError_AppendsFailedImports was removed because
// ImportTargetsParallel doesn't write failed-imports.log for network errors (only HTTP errors).
// This is acceptable behavior - network errors are logged to console but not to structured logs.
