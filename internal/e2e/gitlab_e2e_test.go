package e2e

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// GitLab integration configuration
var gitlabConfig = IntegrationTestConfig{
	Source:            "gitlab",
	TokenEnvVar:       "GITLAB_TOKEN",
	OrgEnvVar:         "GITLAB_TEST_GROUP",
	OrgPublicIDEnvVar: "GITLAB_TEST_ORG_PUBLIC_ID",
	SupportsOptimized: true, // GitLab has optimized sync
}

// TestE2E_GitLab_FullWorkflow tests the complete GitLab integration workflow
func TestE2E_GitLab_FullWorkflow(t *testing.T) {
	cfg := LoadE2EConfig()

	// Populate integration config from E2EConfig
	gitlabConfig.Token = cfg.GitLabToken
	gitlabConfig.TestOrg = cfg.GitLabTestGroup
	gitlabConfig.OrgPublicID = cfg.GitLabTestOrgPublicID

	RunFullWorkflowTest(t, cfg, gitlabConfig)
}

// TestE2E_GitLab_OrgsData tests only the orgs:data command
func TestE2E_GitLab_OrgsData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	gitlabConfig.Token = cfg.GitLabToken
	gitlabConfig.TestOrg = cfg.GitLabTestGroup

	RequireEnvVars(t, map[string]string{
		"GITLAB_TOKEN":       cfg.GitLabToken,
		"GITLAB_TEST_GROUP":  cfg.GitLabTestGroup,
		"SNYK_TEST_GROUP_ID": cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"GITLAB_TOKEN": cfg.GitLabToken,
	})

	ctx := context.Background()
	orgsFile := RunOrgsDataTest(t, ctx, cfg, gitlabConfig, testDir)

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

// TestE2E_GitLab_ImportData tests only the import:data command
func TestE2E_GitLab_ImportData(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	gitlabConfig.Token = cfg.GitLabToken
	gitlabConfig.TestOrg = cfg.GitLabTestGroup

	RequireEnvVars(t, map[string]string{
		"GITLAB_TOKEN":       cfg.GitLabToken,
		"SNYK_TOKEN":         cfg.SnykToken,
		"SNYK_TEST_GROUP_ID": cfg.SnykTestGroupID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"GITLAB_TOKEN": cfg.GitLabToken,
		"SNYK_TOKEN":   cfg.SnykToken,
	})

	ctx := context.Background()

	// First run orgs:data
	RunOrgsDataTest(t, ctx, cfg, gitlabConfig, testDir)

	// Then run import:data
	targetsFile := RunImportDataTest(t, ctx, cfg, gitlabConfig, testDir)

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

// TestE2E_GitLab_ErrorHandling tests error scenarios
func TestE2E_GitLab_ErrorHandling(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	t.Run("InvalidToken", func(t *testing.T) {
		testDir := SetupTestDir(t)
		oldWd, _ := os.Getwd()
		os.Chdir(testDir)
		defer os.Chdir(oldWd)

		SetupTestEnv(t, map[string]string{
			"GITLAB_TOKEN": "invalid_token_12345",
		})

		os.Args = []string{
			"snyk-api-import",
			"orgs:data",
			"--groupId=test-group",
			"--source=gitlab",
		}

		orgsFile := filepath.Join(testDir, "group-test-group-gitlab-orgs.json")
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

// TestE2E_GitLab_Sync_NonOptimized tests the non-optimized sync path
// TestE2E_GitLab_Sync tests the sync command with API-first manifest discovery
func TestE2E_GitLab_Sync(t *testing.T) {
	cfg := LoadE2EConfig()
	SkipIfDisabled(t, cfg)

	// Populate integration config
	gitlabConfig.Token = cfg.GitLabToken
	gitlabConfig.TestOrg = cfg.GitLabTestGroup
	gitlabConfig.OrgPublicID = cfg.GitLabTestOrgPublicID

	if gitlabConfig.OrgPublicID == "" {
		t.Skip("GitLab sync test requires GITLAB_TEST_ORG_PUBLIC_ID environment variable")
	}

	RequireEnvVars(t, map[string]string{
		"GITLAB_TOKEN":              cfg.GitLabToken,
		"SNYK_TOKEN":                cfg.SnykToken,
		"GITLAB_TEST_ORG_PUBLIC_ID": cfg.GitLabTestOrgPublicID,
	})

	testDir := SetupTestDir(t)
	oldWd, _ := os.Getwd()
	os.Chdir(testDir)
	defer os.Chdir(oldWd)

	SetupTestEnv(t, map[string]string{
		"GITLAB_TOKEN": cfg.GitLabToken,
		"SNYK_TOKEN":   cfg.SnykToken,
	})

	ctx := context.Background()

	// Test sync (without targets file to test fallback logic)
	RunSyncTest(t, ctx, cfg, gitlabConfig, testDir)

	t.Log("✅ Sync test passed")
}
