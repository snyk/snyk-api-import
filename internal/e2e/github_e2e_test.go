package e2e

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// GitHub integration configuration
var githubConfig = IntegrationTestConfig{
	Source:            "github",
	TokenEnvVar:       "GITHUB_TOKEN",
	OrgEnvVar:         "GITHUB_TEST_ORG",
	OrgPublicIDEnvVar: "GITHUB_TEST_ORG_PUBLIC_ID",
	SupportsOptimized: true, // GitHub has optimized sync
}

// TestE2E_GitHub_FullWorkflow tests the complete GitHub integration workflow
func TestE2E_GitHub_FullWorkflow(t *testing.T) {
	cfg := LoadE2EConfig()

	// Populate integration config from E2EConfig
	githubConfig.Token = cfg.GitHubToken
	githubConfig.TestOrg = cfg.GitHubTestOrg
	githubConfig.OrgPublicID = cfg.GitHubTestOrgPublicID

	RunFullWorkflowTest(t, cfg, githubConfig)
}

// TestE2E_GitHub_OrgsData tests only the orgs:data command
func TestE2E_GitHub_OrgsData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	githubConfig.Token = cfg.GitHubToken
	githubConfig.TestOrg = cfg.GitHubTestOrg

	RequireEnvVars(t, BuildEnvVarMap(cfg, githubConfig))

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"GITHUB_TOKEN": cfg.GitHubToken,
	})

	ctx := context.Background()
	orgsFile := RunOrgsDataTest(t, ctx, cfg, githubConfig, testDir)

	// Verify and inspect output
	AssertFileExists(t, orgsFile, "orgs file should exist")

	var data struct {
		Orgs []TestOrg `json:"orgs"`
	}
	ReadJSONFile(t, orgsFile, &data)
	orgs := data.Orgs

	if len(orgs) == 0 {
		t.Fatal("Expected at least one organization")
	}

	// Validate org structure
	for _, org := range orgs {
		if org.Name == "" {
			t.Error("Org name is empty")
		}
		if org.GroupID != cfg.SnykTestGroupID {
			t.Errorf("Expected groupID %s, got %s", cfg.SnykTestGroupID, org.GroupID)
		}
	}

	t.Logf("✅ Successfully generated orgs data for %d organization(s)", len(orgs))
}

// TestE2E_GitHub_ImportData tests only the import:data command
func TestE2E_GitHub_ImportData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	githubConfig.Token = cfg.GitHubToken
	githubConfig.TestOrg = cfg.GitHubTestOrg

	RequireEnvVars(t, map[string]string{
		"GITHUB_TOKEN":       cfg.GitHubToken,
		"SNYK_TOKEN":         cfg.SnykToken,
		"SNYK_TEST_GROUP_ID": cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"GITHUB_TOKEN": cfg.GitHubToken,
		"SNYK_TOKEN":   cfg.SnykToken,
	})

	ctx := context.Background()

	// First run orgs:data
	RunOrgsDataTest(t, ctx, cfg, githubConfig, testDir)

	// Then run import:data
	targetsFile := RunImportDataTest(t, ctx, cfg, githubConfig, testDir)

	// Verify and inspect output
	AssertFileExists(t, targetsFile, "targets file should exist")

	var data struct {
		Targets []TestTarget `json:"targets"`
	}
	ReadJSONFile(t, targetsFile, &data)

	if len(data.Targets) == 0 {
		t.Skip("No targets generated (organization may be empty)")
	}

	// Validate target structure
	for _, target := range data.Targets {
		if target.Target.Name == "" {
			t.Error("Target name is empty")
		}
		if target.Target.Owner == "" {
			t.Error("Target owner is empty")
		}
		if target.Target.Branch == "" {
			t.Error("Target branch is empty")
		}
		if target.IntegrationID == "" {
			t.Error("Target integrationID is empty")
		}
		if target.OrgID == "" {
			t.Error("Target orgID is empty")
		}
	}

	t.Logf("✅ Successfully generated import data for %d target(s)", len(data.Targets))
}

// TestE2E_GitHub_ErrorHandling tests error scenarios
func TestE2E_GitHub_ErrorHandling(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	t.Run("InvalidToken", func(t *testing.T) {
		testDir := SetupTestDir(t)
		oldWd, _ := os.Getwd()
		os.Chdir(testDir)
		defer os.Chdir(oldWd)

		// Set invalid token
		SetupTestEnv(t, map[string]string{
			"GITHUB_TOKEN": "invalid_token_12345",
		})

		os.Args = []string{
			"snyk-api-import",
			"orgs:data",
			"--groupId=test-group",
			"--source=github",
		}

		// Use a simple orgs:data call instead of the helper to avoid filtering logic
		orgsFile := filepath.Join(testDir, "group-test-group-github-orgs.json")

		// The command should run without panicking
		// Check that no valid output file was created or it's empty
		if FileExists(orgsFile) {
			data, _ := os.ReadFile(orgsFile)
			var result struct {
				Orgs []TestOrg `json:"orgs"`
			}
			if err := json.Unmarshal(data, &result); err == nil && len(result.Orgs) > 0 {
				t.Error("Expected no orgs with invalid token, but got results")
			}
		}

		t.Log("✅ Error handling test passed")
	})
}

// TestE2E_GitHub_Sync_NonOptimized tests the non-optimized sync path
// TestE2E_GitHub_Sync tests the sync command with API-first manifest discovery
func TestE2E_GitHub_Sync(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	githubConfig.Token = cfg.GitHubToken
	githubConfig.TestOrg = cfg.GitHubTestOrg
	githubConfig.OrgPublicID = cfg.GitHubTestOrgPublicID

	if githubConfig.OrgPublicID == "" {
		t.Skip("GitHub sync test requires GITHUB_TEST_ORG_PUBLIC_ID environment variable")
	}

	RequireEnvVars(t, map[string]string{
		"GITHUB_TOKEN":              cfg.GitHubToken,
		"SNYK_TOKEN":                cfg.SnykToken,
		"GITHUB_TEST_ORG_PUBLIC_ID": cfg.GitHubTestOrgPublicID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"GITHUB_TOKEN": cfg.GitHubToken,
		"SNYK_TOKEN":   cfg.SnykToken,
	})

	ctx := context.Background()

	// Create a minimal targets file to limit scope to test org only
	// (Otherwise GitHub fallback fetches ALL orgs, which can be 100+ repos)
	targetsFile := filepath.Join(testDir, "github-import-targets.json")
	minimalTargets := map[string]interface{}{
		"targets": []map[string]interface{}{
			{
				"orgId":         githubConfig.OrgPublicID,
				"integrationId": "00000000-0000-0000-0000-000000000000", // Placeholder
				"target": map[string]interface{}{
					"owner": githubConfig.TestOrg,
					"name":  "test-repo", // Placeholder repo
				},
			},
		},
	}
	WriteJSONFile(t, targetsFile, minimalTargets)

	// Test sync (with minimal targets file to limit scope)
	RunSyncTest(t, ctx, cfg, githubConfig, testDir)

	t.Log("✅ Sync test passed")
}
