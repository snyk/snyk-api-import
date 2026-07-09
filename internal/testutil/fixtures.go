// Package testutil provides test utilities, fixtures, and helpers for testing
package testutil

import (
	"os"
	"path/filepath"
	"testing"
)

// RepoFixtures contains common test data for different SCM providers
var (
	// GitHub fixtures
	ValidGitHubRepo = map[string]interface{}{
		"name":           "test-repo",
		"owner":          "test-org",
		"full_name":      "test-org/test-repo",
		"default_branch": "main",
		"clone_url":      "https://github.com/test-org/test-repo.git",
		"fork":           false,
	}

	ValidGitHubRepoWithManifests = map[string]interface{}{
		"name":           "app-repo",
		"owner":          "my-org",
		"full_name":      "my-org/app-repo",
		"default_branch": "main",
		"clone_url":      "https://github.com/my-org/app-repo.git",
		"fork":           false,
		"manifests":      []interface{}{"package.json", "pom.xml"},
	}

	// GitLab fixtures
	ValidGitLabProject = map[string]interface{}{
		"id":                  12345,
		"name":                "test-project",
		"path":                "test-project",
		"path_with_namespace": "group/test-project",
		"default_branch":      "main",
		"http_url_to_repo":    "https://gitlab.com/group/test-project.git",
		"fork":                false,
	}

	// Azure DevOps fixtures
	ValidAzureRepo = map[string]interface{}{
		"name":          "azure-repo",
		"owner":         "azure-project",
		"orgName":       "my-azure-org",
		"defaultBranch": "refs/heads/main",
		"remoteUrl":     "https://dev.azure.com/my-azure-org/azure-project/_git/azure-repo",
	}

	// Bitbucket Cloud fixtures
	ValidBitbucketRepo = map[string]interface{}{
		"name":       "bb-repo",
		"full_name":  "workspace/bb-repo",
		"mainbranch": "main",
		"clone_url":  "https://bitbucket.org/workspace/bb-repo.git",
		"is_private": true,
	}
)

// CreateTempFile creates a temporary file with the given content
// If SNYK_LOG_PATH is set, creates the file within that directory
func CreateTempFile(t *testing.T, content string) string {
	t.Helper()

	var tmpDir string
	logPath := os.Getenv("SNYK_LOG_PATH")
	if logPath != "" {
		// Use SNYK_LOG_PATH if set (for security path validation)
		tmpDir = logPath
	} else {
		// Fallback to temp dir
		tmpDir = t.TempDir()
	}

	filePath := filepath.Join(tmpDir, "test-file.txt")

	if err := os.WriteFile(filePath, []byte(content), 0600); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	return filePath
}

// SetEnvVars sets environment variables for tests and returns a cleanup function
func SetEnvVars(t *testing.T, vars map[string]string) func() {
	t.Helper()

	// Save original values
	originals := make(map[string]string)
	for key := range vars {
		originals[key] = os.Getenv(key)
	}

	// Set new values
	for key, value := range vars {
		if err := os.Setenv(key, value); err != nil {
			t.Fatalf("Failed to set env var %s: %v", key, err)
		}
	}

	// Return cleanup function
	return func() {
		for key, original := range originals {
			if original == "" {
				os.Unsetenv(key) //nolint:errcheck // Test cleanup
			} else {
				os.Setenv(key, original) //nolint:errcheck // Test cleanup
			}
		}
	}
}

// SetupTestEnvVars sets common test environment variables including security paths
// Automatically sets SNYK_TESTING_MODE=1 to bypass security path restrictions in tests
func SetupTestEnvVars(t *testing.T, extraVars map[string]string) func() {
	t.Helper()

	vars := map[string]string{
		"SNYK_LOG_PATH":                 t.TempDir(),
		"SNYK_TESTING_MODE":             "1", // Enable test mode in security layer
		"SNYK_TEST_ALLOW_ABSOLUTE_PATH": "1", // Legacy flag for backward compatibility
	}

	// Merge in extra vars
	for k, v := range extraVars {
		vars[k] = v
	}

	return SetEnvVars(t, vars)
}

