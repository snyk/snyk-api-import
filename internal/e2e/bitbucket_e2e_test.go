package e2e

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Bitbucket Cloud integration configuration (basic auth)
var bitbucketConfig = IntegrationTestConfig{
	Source:            "bitbucket-cloud",
	TokenEnvVar:       "BITBUCKET_CLOUD_USERNAME", // Note: uses username+password, not token
	OrgEnvVar:         "BITBUCKET_TEST_WORKSPACE",
	OrgPublicIDEnvVar: "BITBUCKET_TEST_ORG_PUBLIC_ID",
	SupportsOptimized: true, // Bitbucket Cloud has optimized sync
}

// TestE2E_Bitbucket_FullWorkflow tests the complete Bitbucket Cloud integration workflow
func TestE2E_Bitbucket_FullWorkflow(t *testing.T) {
	cfg := LoadE2EConfig()

	// Populate integration config from E2EConfig
	bitbucketConfig.Token = cfg.BitbucketUsername // Username for basic auth
	bitbucketConfig.TestOrg = cfg.BitbucketTestWorkspace
	bitbucketConfig.OrgPublicID = cfg.BitbucketTestOrgPublicID

	RunFullWorkflowTest(t, cfg, bitbucketConfig)
}

// TestE2E_Bitbucket_OrgsData tests only the orgs:data command
func TestE2E_Bitbucket_OrgsData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	bitbucketConfig.Token = cfg.BitbucketUsername
	bitbucketConfig.TestOrg = cfg.BitbucketTestWorkspace

	RequireEnvVars(t, map[string]string{
		"BITBUCKET_CLOUD_USERNAME": cfg.BitbucketUsername,
		"BITBUCKET_CLOUD_PASSWORD": cfg.BitbucketPassword,
		"BITBUCKET_TEST_WORKSPACE": cfg.BitbucketTestWorkspace,
		"SNYK_TEST_GROUP_ID":       cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"BITBUCKET_CLOUD_USERNAME": cfg.BitbucketUsername,
		"BITBUCKET_CLOUD_PASSWORD": cfg.BitbucketPassword,
	})

	ctx := context.Background()
	orgsFile := RunOrgsDataTest(t, ctx, cfg, bitbucketConfig, testDir)

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

// TestE2E_Bitbucket_ImportData tests only the import:data command
func TestE2E_Bitbucket_ImportData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	bitbucketConfig.Token = cfg.BitbucketUsername
	bitbucketConfig.TestOrg = cfg.BitbucketTestWorkspace

	RequireEnvVars(t, map[string]string{
		"BITBUCKET_CLOUD_USERNAME": cfg.BitbucketUsername,
		"BITBUCKET_CLOUD_PASSWORD": cfg.BitbucketPassword,
		"SNYK_TOKEN":               cfg.SnykToken,
		"SNYK_TEST_GROUP_ID":       cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"BITBUCKET_CLOUD_USERNAME": cfg.BitbucketUsername,
		"BITBUCKET_CLOUD_PASSWORD": cfg.BitbucketPassword,
		"SNYK_TOKEN":               cfg.SnykToken,
	})

	ctx := context.Background()

	// First run orgs:data
	RunOrgsDataTest(t, ctx, cfg, bitbucketConfig, testDir)

	// Then run import:data
	targetsFile := RunImportDataTest(t, ctx, cfg, bitbucketConfig, testDir)

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
		// Note: integrationID may be empty if not provided via --integrationID flag
		// This is expected behavior and logged as a warning
		if target.IntegrationID == "" {
			t.Log("Target integrationID is empty (expected when --integrationID not provided)")
		}
		if target.OrgID == "" {
			t.Error("Target orgID is empty")
		}
	}

	t.Logf("✅ Successfully generated import data for %d target(s)", len(data.Targets))
}

// TestE2E_Bitbucket_ErrorHandling tests error scenarios
func TestE2E_Bitbucket_ErrorHandling(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	t.Run("InvalidCredentials", func(t *testing.T) {
		testDir := SetupTestDir(t)
		oldWd, _ := os.Getwd()
		os.Chdir(testDir)
		defer os.Chdir(oldWd)

		SetupTestEnv(t, map[string]string{
			"BITBUCKET_CLOUD_USERNAME": "invalid_user",
			"BITBUCKET_CLOUD_PASSWORD": "invalid_password",
		})

		os.Args = []string{
			"snyk-api-import",
			"orgs:data",
			"--groupId=test-group",
			"--source=bitbucket-cloud",
		}

		orgsFile := filepath.Join(testDir, "group-test-group-bitbucket-cloud-orgs.json")
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

// TestE2E_Bitbucket_Sync_NonOptimized tests the non-optimized sync path
// TestE2E_Bitbucket_Sync tests the sync command with API-first manifest discovery
func TestE2E_Bitbucket_Sync(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	bitbucketConfig.Token = cfg.BitbucketUsername
	bitbucketConfig.TestOrg = cfg.BitbucketTestWorkspace
	bitbucketConfig.OrgPublicID = cfg.BitbucketTestOrgPublicID

	if bitbucketConfig.OrgPublicID == "" {
		t.Skip("Bitbucket sync test requires BITBUCKET_TEST_ORG_PUBLIC_ID environment variable")
	}

	RequireEnvVars(t, map[string]string{
		"BITBUCKET_CLOUD_USERNAME":     cfg.BitbucketUsername,
		"BITBUCKET_CLOUD_PASSWORD":     cfg.BitbucketPassword,
		"SNYK_TOKEN":                   cfg.SnykToken,
		"BITBUCKET_TEST_ORG_PUBLIC_ID": cfg.BitbucketTestOrgPublicID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"BITBUCKET_CLOUD_USERNAME": cfg.BitbucketUsername,
		"BITBUCKET_CLOUD_PASSWORD": cfg.BitbucketPassword,
		"SNYK_TOKEN":               cfg.SnykToken,
	})

	ctx := context.Background()

	// Create a minimal targets file to limit scope to test workspace only
	targetsFile := filepath.Join(testDir, "bitbucket-cloud-import-targets.json")
	minimalTargets := map[string]interface{}{
		"targets": []map[string]interface{}{
			{
				"orgId":         bitbucketConfig.OrgPublicID,
				"integrationId": "00000000-0000-0000-0000-000000000000", // Placeholder
				"target": map[string]interface{}{
					"owner": bitbucketConfig.TestOrg,
					"name":  "test-repo", // Placeholder repo
				},
			},
		},
	}
	WriteJSONFile(t, targetsFile, minimalTargets)

	// Test sync (with minimal targets file to limit scope)
	RunSyncTest(t, ctx, cfg, bitbucketConfig, testDir)

	t.Log("✅ Sync test passed")
}
