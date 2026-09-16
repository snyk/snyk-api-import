package cmd

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/snyk/snyk-api-import/internal"
)

func TestOrgsCreateCmd_NoDuplicateNamesFlag(t *testing.T) {
	td := t.TempDir()

	// Create a test orgs file
	orgsFile := filepath.Join(td, "test-orgs.json")
	orgsData := map[string]interface{}{
		"orgs": []map[string]string{
			{"name": "test-org", "groupId": "test-group"},
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

	// Test with noDuplicateNames=true (default)
	os.Args = []string{"prog", "orgs:create", "--file=" + orgsFile, "--noDuplicateNames=true"}

	// Note: This will fail due to missing SNYK_TOKEN, but we're testing flag parsing
	// The command will return early with an error, which is expected
	OrgsCreateCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, flag parsing worked
}

func TestOrgsCreateCmd_IncludeExistingOrgsInOutputFlag(t *testing.T) {
	td := t.TempDir()

	// Create a test orgs file
	orgsFile := filepath.Join(td, "test-orgs.json")
	orgsData := map[string]interface{}{
		"orgs": []map[string]string{
			{"name": "test-org", "groupId": "test-group"},
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

	// Test with includeExistingOrgsInOutput=true
	os.Args = []string{"prog", "orgs:create", "--file=" + orgsFile, "--includeExistingOrgsInOutput=true"}

	// Note: This will fail due to missing SNYK_TOKEN, but we're testing flag parsing
	OrgsCreateCmd(context.Background(), internal.AppConfig{})
	// If we reach here without panic, flag parsing worked
}

func TestFindOrgInSnyk(t *testing.T) {
	orgs := []internal.SnykOrg{
		{ID: "org-1", Name: "Test Org 1", Slug: "test-org-1"},
		{ID: "org-2", Name: "Test Org 2", Slug: "test-org-2"},
	}

	// Test finding an existing org
	result, found := findOrgInSnyk(orgs, "Test Org 1")
	if !found {
		t.Fatal("Expected to find org, but didn't")
	}
	if result["name"] != "Test Org 1" {
		t.Errorf("Expected name='Test Org 1', got '%v'", result["name"])
	}
	if result["id"] != "org-1" {
		t.Errorf("Expected id='org-1', got '%v'", result["id"])
	}
	if result["slug"] != "test-org-1" {
		t.Errorf("Expected slug='test-org-1', got '%v'", result["slug"])
	}

	// Test not finding an org
	_, found = findOrgInSnyk(orgs, "Non-existent Org")
	if found {
		t.Error("Expected not to find org, but did")
	}
}
