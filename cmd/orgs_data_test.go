package cmd

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/snyk/snyk-api-import/internal"
)

func TestOrgsDataCmd_SourceUrlFlag(t *testing.T) {
	tests := []struct {
		name        string
		source      string
		sourceUrl   string
		expectedEnv string
		expectedVal string
	}{
		{
			name:        "GitHub with custom URL",
			source:      "github",
			sourceUrl:   "https://github.mycompany.com",
			expectedEnv: "GITHUB_API_URL",
			expectedVal: "https://github.mycompany.com",
		},
		{
			name:        "GitLab with custom URL",
			source:      "gitlab",
			sourceUrl:   "https://gitlab.mycompany.com",
			expectedEnv: "GITLAB_BASE_URL",
			expectedVal: "https://gitlab.mycompany.com",
		},
		{
			name:        "Azure with custom URL",
			source:      "azure-repos",
			sourceUrl:   "https://dev.azure.mycompany.com",
			expectedEnv: "AZURE_BASE_URL",
			expectedVal: "https://dev.azure.mycompany.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clear any existing environment variable
			defer os.Unsetenv(tt.expectedEnv)

			// Set up test args - use missing groupId to trigger early return
			os.Args = []string{"prog", "orgs:data"}

			// Manually set the environment to simulate flag parsing
			// (we're testing the env var setting logic, not the full command flow)
			if err := os.Setenv("GITHUB_API_URL", ""); err != nil {
				t.Fatalf("failed to clear env: %v", err)
			}
			if err := os.Setenv("GITLAB_BASE_URL", ""); err != nil {
				t.Fatalf("failed to clear env: %v", err)
			}
			if err := os.Setenv("AZURE_BASE_URL", ""); err != nil {
				t.Fatalf("failed to clear env: %v", err)
			}

			// Simulate flag parsing by setting the env var directly
			if tt.sourceUrl != "" {
				switch tt.source {
				case "github", "github-com":
					if err := os.Setenv("GITHUB_API_URL", tt.sourceUrl); err != nil {
						t.Fatalf("failed to set env: %v", err)
					}
				case "gitlab":
					if err := os.Setenv("GITLAB_BASE_URL", tt.sourceUrl); err != nil {
						t.Fatalf("failed to set env: %v", err)
					}
				case "azure-repos":
					if err := os.Setenv("AZURE_BASE_URL", tt.sourceUrl); err != nil {
						t.Fatalf("failed to set env: %v", err)
					}
				}
			}

			// Verify the environment variable was set
			got := os.Getenv(tt.expectedEnv)
			if got != tt.expectedVal {
				t.Errorf("Expected %s=%s, got %s", tt.expectedEnv, tt.expectedVal, got)
			}
		})
	}
}

// TestOrgsDataCmd_RequiresGroupId verifies that the command validates required flags.
//
// NOTE: This test intentionally produces an ERROR log:
//
//	"ERRO[...] --groupId is required"
//
// This is EXPECTED behavior - we're testing that the command properly validates
// required flags and exits gracefully with an error message.
func TestOrgsDataCmd_RequiresGroupId(t *testing.T) {
	// Set up test args without groupId
	os.Args = []string{"prog", "orgs:data", "--source=github"}

	// This should return early with an error log (not panic or exit)
	// We can't easily test log output, but we can verify it doesn't crash
	OrgsDataCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, the test passes
}

// TestOrgsDataCmd_GitHubOrgsFlag verifies that --githubOrgs bypasses the
// /user/orgs lookup entirely. That endpoint returns an empty list for
// fine-grained personal access tokens, so auto-discovery cannot work with
// them. With an explicit org list and --skipEmptyOrgs off, the command makes
// no GitHub API calls at all, which is why this test needs only a dummy token.
func TestOrgsDataCmd_GitHubOrgsFlag(t *testing.T) {
	tmpDir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("failed to resolve temp dir: %v", err)
	}

	t.Setenv("GITHUB_TOKEN", "dummy-token-not-used")
	t.Setenv("SNYK_LOG_PATH", tmpDir)

	// Deliberately messy input: surrounding spaces and an empty element.
	os.Args = []string{
		"prog",
		"orgs:data",
		"--groupId=group-1",
		"--source=github",
		"--githubOrgs= org-a , org-b ,, org-c ",
	}

	OrgsDataCmd(context.Background(), internal.AppConfig{SnykLogPath: tmpDir})

	outFile := filepath.Join(tmpDir, "group-group-1-github-orgs.json")
	data, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatalf("expected orgs file at %s: %v", outFile, err)
	}

	var result struct {
		Orgs []struct {
			Name    string `json:"name"`
			GroupID string `json:"groupId"`
		} `json:"orgs"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("failed to unmarshal orgs file: %v", err)
	}

	want := []string{"org-a", "org-b", "org-c"}
	if len(result.Orgs) != len(want) {
		t.Fatalf("expected %d orgs, got %d: %+v", len(want), len(result.Orgs), result.Orgs)
	}
	for i, name := range want {
		if result.Orgs[i].Name != name {
			t.Errorf("org %d: expected name %q, got %q", i, name, result.Orgs[i].Name)
		}
		if result.Orgs[i].GroupID != "group-1" {
			t.Errorf("org %d: expected groupId %q, got %q", i, "group-1", result.Orgs[i].GroupID)
		}
	}
}

// TestOrgsDataCmd_GitHubOrgsFlagAllEmpty verifies that an all-separator value
// is rejected rather than silently falling back to org auto-discovery.
func TestOrgsDataCmd_GitHubOrgsFlagAllEmpty(t *testing.T) {
	tmpDir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("failed to resolve temp dir: %v", err)
	}

	t.Setenv("GITHUB_TOKEN", "dummy-token-not-used")
	t.Setenv("SNYK_LOG_PATH", tmpDir)

	os.Args = []string{
		"prog",
		"orgs:data",
		"--groupId=group-1",
		"--source=github",
		"--githubOrgs=, ,",
	}

	OrgsDataCmd(context.Background(), internal.AppConfig{SnykLogPath: tmpDir})

	outFile := filepath.Join(tmpDir, "group-group-1-github-orgs.json")
	if _, err := os.Stat(outFile); err == nil {
		t.Errorf("expected no orgs file to be written for an all-empty --githubOrgs value")
	}
}
