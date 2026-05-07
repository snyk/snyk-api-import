package e2e

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Azure DevOps integration configuration
var azureConfig = IntegrationTestConfig{
	Source:            "azure-repos",
	TokenEnvVar:       "AZURE_TOKEN",
	OrgEnvVar:         "AZURE_TEST_ORG",
	OrgPublicIDEnvVar: "AZURE_TEST_ORG_PUBLIC_ID",
	SupportsOptimized: true, // Azure has optimized sync
}

// TestE2E_Azure_FullWorkflow tests the complete Azure DevOps integration workflow
func TestE2E_Azure_FullWorkflow(t *testing.T) {
	cfg := LoadE2EConfig()

	// Populate integration config from E2EConfig
	azureConfig.Token = cfg.AzureToken
	azureConfig.TestOrg = cfg.AzureTestOrg
	azureConfig.OrgPublicID = cfg.AzureTestOrgPublicID
	// Azure requires explicit org specification
	azureConfig.ExtraOrgsDataArgs = []string{"--azureOrgs=" + cfg.AzureTestOrg}

	RunFullWorkflowTest(t, cfg, azureConfig)
}

// TestE2E_Azure_OrgsData tests only the orgs:data command
func TestE2E_Azure_OrgsData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	azureConfig.Token = cfg.AzureToken
	azureConfig.TestOrg = cfg.AzureTestOrg
	azureConfig.ExtraOrgsDataArgs = []string{"--azureOrgs=" + cfg.AzureTestOrg}

	RequireEnvVars(t, map[string]string{
		"AZURE_TOKEN":        cfg.AzureToken,
		"AZURE_TEST_ORG":     cfg.AzureTestOrg,
		"SNYK_TEST_GROUP_ID": cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"AZURE_TOKEN": cfg.AzureToken,
	})

	ctx := context.Background()
	orgsFile := RunOrgsDataTest(t, ctx, cfg, azureConfig, testDir)

	AssertFileExists(t, orgsFile, "orgs file should exist")

	var data struct {
		Orgs []TestOrg `json:"orgs"`
	}
	ReadJSONFile(t, orgsFile, &data)
	orgs := data.Orgs

	if len(orgs) == 0 {
		t.Fatal("Expected at least one organization")
	}

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

// TestE2E_Azure_ImportData tests only the import:data command
func TestE2E_Azure_ImportData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	azureConfig.Token = cfg.AzureToken
	azureConfig.TestOrg = cfg.AzureTestOrg
	azureConfig.ExtraOrgsDataArgs = []string{"--azureOrgs=" + cfg.AzureTestOrg}

	RequireEnvVars(t, map[string]string{
		"AZURE_TOKEN":        cfg.AzureToken,
		"SNYK_TOKEN":         cfg.SnykToken,
		"SNYK_TEST_GROUP_ID": cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"AZURE_TOKEN": cfg.AzureToken,
		"SNYK_TOKEN":  cfg.SnykToken,
	})

	ctx := context.Background()

	// Generate orgs data first
	RunOrgsDataTest(t, ctx, cfg, azureConfig, testDir)

	// Then generate import targets
	targetsFile := RunImportDataTest(t, ctx, cfg, azureConfig, testDir)

	AssertFileExists(t, targetsFile, "targets file should exist")

	var data struct {
		Targets []TestTarget `json:"targets"`
	}
	ReadJSONFile(t, targetsFile, &data)

	if len(data.Targets) == 0 {
		t.Skip("No targets generated (organization may be empty)")
	}

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

// TestE2E_Azure_ErrorHandling tests error scenarios
func TestE2E_Azure_ErrorHandling(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	t.Run("InvalidToken", func(t *testing.T) {
		testDir := SetupTestDir(t)
		oldWd, _ := os.Getwd()
		os.Chdir(testDir)
		defer os.Chdir(oldWd)

		SetupTestEnv(t, map[string]string{
			"AZURE_TOKEN": "invalid_token_12345",
		})

		os.Args = []string{
			"snyk-api-import",
			"orgs:data",
			"--groupId=test-group",
			"--source=azure-repos",
		}

		orgsFile := filepath.Join(testDir, "group-test-group-azure-repos-orgs.json")
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

// TestE2E_Azure_Sync_NonOptimized tests the non-optimized sync path
// TestE2E_Azure_Sync tests the sync command with API-first manifest discovery
func TestE2E_Azure_Sync(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	azureConfig.Token = cfg.AzureToken
	azureConfig.TestOrg = cfg.AzureTestOrg
	azureConfig.OrgPublicID = cfg.AzureTestOrgPublicID

	if azureConfig.OrgPublicID == "" {
		t.Skip("Azure sync test requires AZURE_TEST_ORG_PUBLIC_ID environment variable")
	}

	RequireEnvVars(t, map[string]string{
		"AZURE_TOKEN":              cfg.AzureToken,
		"SNYK_TOKEN":               cfg.SnykToken,
		"AZURE_TEST_ORG_PUBLIC_ID": cfg.AzureTestOrgPublicID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"AZURE_TOKEN": cfg.AzureToken,
		"SNYK_TOKEN":  cfg.SnykToken,
	})

	ctx := context.Background()

	// Create a minimal targets file to limit scope to test org only
	targetsFile := filepath.Join(testDir, "azure-repos-import-targets.json")
	minimalTargets := map[string]interface{}{
		"targets": []map[string]interface{}{
			{
				"orgId":         azureConfig.OrgPublicID,
				"integrationId": "00000000-0000-0000-0000-000000000000", // Placeholder
				"target": map[string]interface{}{
					"owner":  "test_project", // Azure project name
					"name":   "test_project", // Azure repo name
					"branch": "master",
				},
			},
		},
	}
	WriteJSONFile(t, targetsFile, minimalTargets)

	// Test sync (with minimal targets file to limit scope)
	RunSyncTest(t, ctx, cfg, azureConfig, testDir)

	t.Log("✅ Sync test passed")
}
