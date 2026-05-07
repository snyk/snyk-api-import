package cmd

import (
	"context"
	"os"
	"testing"

	"github.com/sam1el/snyk-api-import-go/internal"
)

// TestSyncCmd_SourceUrlFlag verifies that custom source URLs are correctly
// parsed and set as environment variables.
//
// NOTE: These tests intentionally produce ERROR logs like:
//
//	"ERRO[...] SNYK_LOG_PATH environment variable is not set."
//
// This is EXPECTED behavior - we're testing flag parsing, not full sync execution.
// The tests validate that flags are parsed correctly before the command exits
// due to missing required environment variables.
func TestSyncCmd_SourceUrlFlag(t *testing.T) {
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
		{
			name:        "Bitbucket Server with custom URL",
			source:      "bitbucket-server",
			sourceUrl:   "https://bitbucket.mycompany.com",
			expectedEnv: "BITBUCKET_SERVER_URL",
			expectedVal: "https://bitbucket.mycompany.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clear any existing environment variable
			defer os.Unsetenv(tt.expectedEnv)
			defer os.Unsetenv("SNYK_LOG_PATH")

			// Set up test args - will fail due to missing SNYK_LOG_PATH, but we're testing flag parsing
			os.Args = []string{"prog", "sync", "--source=" + tt.source, "--sourceUrl=" + tt.sourceUrl, "--orgPublicId=test-org"}

			// Run the command - it will fail early due to missing SNYK_LOG_PATH, but that's okay
			// We're just testing that the flag parsing and env var setting worked
			SyncCmd(context.Background(), internal.AppConfig{})

			// Verify the environment variable was set
			got := os.Getenv(tt.expectedEnv)
			if got != tt.expectedVal {
				t.Errorf("Expected %s=%s, got %s", tt.expectedEnv, tt.expectedVal, got)
			}
		})
	}
}

// TestSyncCmd_SnykProductFlag verifies that the --snykProduct flag is validated.
//
// NOTE: These tests intentionally produce ERROR logs like:
//
//	"ERRO[...] SNYK_LOG_PATH environment variable is not set."
//	"ERRO[...] Invalid --snykProduct value: invalidProduct..."
//
// This is EXPECTED behavior - we're testing validation logic.
func TestSyncCmd_SnykProductFlag(t *testing.T) {
	tests := []struct {
		name          string
		snykProduct   string
		shouldSetEnv  bool
		expectedError bool
	}{
		{
			name:         "Valid openSource product",
			snykProduct:  "openSource",
			shouldSetEnv: true,
		},
		{
			name:         "Valid container product",
			snykProduct:  "container",
			shouldSetEnv: true,
		},
		{
			name:         "Valid iac product",
			snykProduct:  "iac",
			shouldSetEnv: true,
		},
		{
			name:          "Invalid product",
			snykProduct:   "invalidProduct",
			shouldSetEnv:  false,
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer os.Unsetenv("SNYK_PRODUCT")
			defer os.Unsetenv("SNYK_LOG_PATH")

			// Set up test args
			os.Args = []string{"prog", "sync", "--source=github", "--orgPublicId=test-org", "--snykProduct=" + tt.snykProduct}

			// Run the command
			SyncCmd(context.Background(), internal.AppConfig{})

			// Verify the environment variable was set (or not)
			got := os.Getenv("SNYK_PRODUCT")
			if tt.shouldSetEnv && got != tt.snykProduct {
				t.Errorf("Expected SNYK_PRODUCT=%s, got %s", tt.snykProduct, got)
			}
			if !tt.shouldSetEnv && got != "" {
				t.Errorf("Expected SNYK_PRODUCT to not be set for invalid product, but got %s", got)
			}
		})
	}
}

func TestSyncCmd_ExclusionGlobsFlag(t *testing.T) {
	defer os.Unsetenv("EXCLUSION_GLOBS")
	defer os.Unsetenv("SNYK_LOG_PATH")

	expectedGlobs := "**/test/**,**/fixtures/**,**/node_modules/**"
	os.Args = []string{"prog", "sync", "--source=github", "--orgPublicId=test-org", "--exclusionGlobs=" + expectedGlobs}

	// Run the command - will fail due to missing SNYK_LOG_PATH, but we're testing flag parsing
	SyncCmd(context.Background(), internal.AppConfig{})

	// Verify the environment variable was set
	got := os.Getenv("EXCLUSION_GLOBS")
	if got != expectedGlobs {
		t.Errorf("Expected EXCLUSION_GLOBS=%s, got %s", expectedGlobs, got)
	}
}

func TestSyncCmd_RequiredFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{
			name: "Missing orgPublicId",
			args: []string{"prog", "sync", "--source=github"},
		},
		{
			name: "Missing source",
			args: []string{"prog", "sync", "--orgPublicId=test-org"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			os.Args = tt.args

			// This should return early with an error log
			SyncCmd(context.Background(), internal.AppConfig{})
			// If we reach here without panic, the test passes
		})
	}
}
