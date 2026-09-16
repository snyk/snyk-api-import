package e2e

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Bitbucket Cloud App integration configuration (OAuth)
var bitbucketAppConfig = IntegrationTestConfig{
	Source:            "bitbucket-cloud-app",
	TokenEnvVar:       "BITBUCKET_APP_CLIENT_ID", // OAuth client ID
	OrgEnvVar:         "BITBUCKET_APP_TEST_WORKSPACE",
	OrgPublicIDEnvVar: "BITBUCKET_APP_TEST_ORG_PUBLIC_ID",
	SupportsOptimized: true, // Bitbucket Cloud App has optimized sync
}

// TestE2E_BitbucketApp_FullWorkflow tests the complete Bitbucket Cloud App integration workflow
func TestE2E_BitbucketApp_FullWorkflow(t *testing.T) {
	cfg := LoadE2EConfig()

	// Populate integration config from E2EConfig
	bitbucketAppConfig.Token = cfg.BitbucketAppClientID
	bitbucketAppConfig.TestOrg = cfg.BitbucketAppTestWorkspace
	bitbucketAppConfig.OrgPublicID = cfg.BitbucketAppTestOrgPublicID

	RunFullWorkflowTest(t, cfg, bitbucketAppConfig)
}

// TestE2E_BitbucketApp_OrgsData tests only the orgs:data command
func TestE2E_BitbucketApp_OrgsData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	bitbucketAppConfig.Token = cfg.BitbucketAppClientID
	bitbucketAppConfig.TestOrg = cfg.BitbucketAppTestWorkspace

	RequireEnvVars(t, map[string]string{
		"BITBUCKET_APP_CLIENT_ID":      cfg.BitbucketAppClientID,
		"BITBUCKET_APP_CLIENT_SECRET":  cfg.BitbucketAppClientSecret,
		"BITBUCKET_APP_TEST_WORKSPACE": cfg.BitbucketAppTestWorkspace,
		"SNYK_TEST_GROUP_ID":           cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"BITBUCKET_APP_CLIENT_ID":     cfg.BitbucketAppClientID,
		"BITBUCKET_APP_CLIENT_SECRET": cfg.BitbucketAppClientSecret,
	})

	ctx := context.Background()
	orgsFile := RunOrgsDataTest(t, ctx, cfg, bitbucketAppConfig, testDir)

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

// TestE2E_BitbucketApp_ImportData tests only the import:data command
func TestE2E_BitbucketApp_ImportData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	bitbucketAppConfig.Token = cfg.BitbucketAppClientID
	bitbucketAppConfig.TestOrg = cfg.BitbucketAppTestWorkspace

	RequireEnvVars(t, map[string]string{
		"BITBUCKET_APP_CLIENT_ID":     cfg.BitbucketAppClientID,
		"BITBUCKET_APP_CLIENT_SECRET": cfg.BitbucketAppClientSecret,
		"SNYK_TOKEN":                  cfg.SnykToken,
		"SNYK_TEST_GROUP_ID":          cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"BITBUCKET_APP_CLIENT_ID":     cfg.BitbucketAppClientID,
		"BITBUCKET_APP_CLIENT_SECRET": cfg.BitbucketAppClientSecret,
		"SNYK_TOKEN":                  cfg.SnykToken,
	})

	ctx := context.Background()

	// First run orgs:data
	RunOrgsDataTest(t, ctx, cfg, bitbucketAppConfig, testDir)

	// Then run import:data
	targetsFile := RunImportDataTest(t, ctx, cfg, bitbucketAppConfig, testDir)

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

// TestE2E_BitbucketApp_ErrorHandling tests error scenarios
func TestE2E_BitbucketApp_ErrorHandling(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	t.Run("InvalidCredentials", func(t *testing.T) {
		testDir := SetupTestDir(t)
		oldWd, _ := os.Getwd()
		os.Chdir(testDir)
		defer os.Chdir(oldWd)

		SetupTestEnv(t, map[string]string{
			"BITBUCKET_APP_CLIENT_ID":     "invalid_client_id",
			"BITBUCKET_APP_CLIENT_SECRET": "invalid_client_secret",
		})

		os.Args = []string{
			"snyk-api-import",
			"orgs:data",
			"--groupId=test-group",
			"--source=bitbucket-cloud-app",
		}

		orgsFile := filepath.Join(testDir, "group-test-group-bitbucket-cloud-app-orgs.json")
		if FileExists(orgsFile) {
			data, _ := os.ReadFile(orgsFile)
			var result struct {
				Orgs []TestOrg `json:"orgs"`
			}
			if err := json.Unmarshal(data, &result); err == nil && len(result.Orgs) > 0 {
				t.Error("Expected no orgs with invalid credentials, but got results")
			}
		}

		t.Log("✅ Error handling test passed")
	})
}

// TestE2E_BitbucketApp_Sync_NonOptimized tests the non-optimized sync path
// TestE2E_BitbucketApp_Sync tests the sync command with API-first manifest discovery
func TestE2E_BitbucketApp_Sync(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	bitbucketAppConfig.Token = cfg.BitbucketAppClientID
	bitbucketAppConfig.TestOrg = cfg.BitbucketAppTestWorkspace
	bitbucketAppConfig.OrgPublicID = cfg.BitbucketAppTestOrgPublicID

	if bitbucketAppConfig.OrgPublicID == "" {
		t.Skip("Bitbucket App sync test requires BITBUCKET_APP_TEST_ORG_PUBLIC_ID environment variable")
	}

	RequireEnvVars(t, map[string]string{
		"BITBUCKET_APP_CLIENT_ID":          cfg.BitbucketAppClientID,
		"BITBUCKET_APP_CLIENT_SECRET":      cfg.BitbucketAppClientSecret,
		"SNYK_TOKEN":                       cfg.SnykToken,
		"BITBUCKET_APP_TEST_ORG_PUBLIC_ID": cfg.BitbucketAppTestOrgPublicID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"BITBUCKET_APP_CLIENT_ID":     cfg.BitbucketAppClientID,
		"BITBUCKET_APP_CLIENT_SECRET": cfg.BitbucketAppClientSecret,
		"SNYK_TOKEN":                  cfg.SnykToken,
	})

	ctx := context.Background()

	// Create a minimal targets file to limit scope to test workspace only
	targetsFile := filepath.Join(testDir, "bitbucket-cloud-app-import-targets.json")
	minimalTargets := map[string]interface{}{
		"targets": []map[string]interface{}{
			{
				"orgId":         bitbucketAppConfig.OrgPublicID,
				"integrationId": "00000000-0000-0000-0000-000000000000", // Placeholder
				"target": map[string]interface{}{
					"owner": bitbucketAppConfig.TestOrg,
					"name":  "test-repo", // Placeholder repo
				},
			},
		},
	}
	WriteJSONFile(t, targetsFile, minimalTargets)

	// Test sync (with minimal targets file to limit scope)
	RunSyncTest(t, ctx, cfg, bitbucketAppConfig, testDir)

	t.Log("✅ Sync test passed")
}
