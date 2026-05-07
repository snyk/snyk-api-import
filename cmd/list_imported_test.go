package cmd

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/sam1el/snyk-api-import-go/internal"
)

func TestListImportedCmd_IntegrationTypeFlag(t *testing.T) {
	td := t.TempDir()

	// Set up environment
	if eval, err := filepath.EvalSymlinks(td); err == nil {
		if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	} else {
		if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	if err := os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1"); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")

	// Test using integrationType flag
	os.Args = []string{"prog", "list:imported", "--groupId=test-group", "--orgId=test-org", "--integrationType=github"}

	// This will fail due to missing projects, but we're testing flag parsing
	ListImportedCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, the test passes
}

func TestListImportedCmd_DeprecatedSourceFlag(t *testing.T) {
	td := t.TempDir()

	// Set up environment
	if eval, err := filepath.EvalSymlinks(td); err == nil {
		if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	} else {
		if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	if err := os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1"); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")

	// Test using deprecated source flag (should still work)
	os.Args = []string{"prog", "list:imported", "--groupId=test-group", "--orgId=test-org", "--source=github"}

	// This will fail due to missing projects, but we're testing flag parsing
	ListImportedCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, the test passes
}

func TestListImportedCmd_OrgIdFlag(t *testing.T) {
	td := t.TempDir()

	// Set up environment
	if eval, err := filepath.EvalSymlinks(td); err == nil {
		if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	} else {
		if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	if err := os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1"); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")

	// Test with orgId instead of orgsFile
	os.Args = []string{"prog", "list:imported", "--groupId=test-group", "--orgId=test-org", "--integrationType=github"}

	// This will fail due to missing projects, but we're testing flag parsing
	ListImportedCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, the test passes
}

func TestListImportedCmd_OrgsFileFlag(t *testing.T) {
	td := t.TempDir()

	// Create a test orgs file
	orgsFile := filepath.Join(td, "test-orgs.json")
	orgsData := map[string]interface{}{
		"orgs": []map[string]string{
			{"name": "test-org", "orgId": "test-org-id"},
		},
	}
	orgsJSON, err := json.Marshal(orgsData)
	if err != nil {
		t.Fatalf("failed to marshal orgs data: %v", err)
	}
	if err := os.WriteFile(orgsFile, orgsJSON, 0600); err != nil {
		t.Fatalf("failed to write orgs file: %v", err)
	}

	// Set up environment
	if eval, err := filepath.EvalSymlinks(td); err == nil {
		if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	} else {
		if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	if err := os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1"); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")

	// Test with orgsFile
	os.Args = []string{"prog", "list:imported", "--groupId=test-group", "--orgsFile=" + orgsFile, "--integrationType=github"}

	// This will fail due to missing projects, but we're testing flag parsing
	ListImportedCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, the test passes
}

func TestListImportedCmd_RequiredFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{
			name: "Missing groupId",
			args: []string{"prog", "list:imported", "--orgId=test-org", "--integrationType=github"},
		},
		{
			name: "Missing integrationType",
			args: []string{"prog", "list:imported", "--groupId=test-group", "--orgId=test-org"},
		},
		{
			name: "Missing both orgId and orgsFile",
			args: []string{"prog", "list:imported", "--groupId=test-group", "--integrationType=github"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			td := t.TempDir()

			// Set up environment
			if eval, err := filepath.EvalSymlinks(td); err == nil {
				if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
					t.Fatalf("setenv failed: %v", err)
				}
			} else {
				if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
					t.Fatalf("setenv failed: %v", err)
				}
			}
			defer os.Unsetenv("SNYK_LOG_PATH")

			os.Args = tt.args

			// This should return early with an error log
			ListImportedCmd(context.Background(), internal.AppConfig{})
			// If we reach here without panic, the test passes
		})
	}
}
