package testdata

import (
	"encoding/json"
	"testing"
)

// TestLoadFixtures verifies that all fixtures can be loaded
func TestLoadFixtures(t *testing.T) {
	fixtures := []string{
		// GitHub
		GitHubReposSuccess,
		GitHubErrorUnauthorized,
		GitHubErrorNotFound,
		GitHubErrorRateLimit,
		// GitLab
		GitLabProjectsSuccess,
		GitLabErrorUnauthorized,
		// Bitbucket Cloud
		BitbucketReposSuccess,
		BitbucketErrorUnauthorized,
		// Azure DevOps
		AzureReposSuccess,
		AzureProjectsSuccess,
		AzureErrorUnauthorized,
		// Snyk API
		SnykProjectsSuccess,
		SnykIntegrationsSuccess,
		SnykErrorUnauthorized,
		SnykErrorOrgNotFound,
		// Manifests
		ManifestNodeJS,
		ManifestJava,
		ManifestPython,
		ManifestInfrastructure,
		// Sync
		SyncSnykProjects,
		SyncSCMRepos,
	}

	for _, fixture := range fixtures {
		t.Run(fixture, func(t *testing.T) {
			data, err := LoadFixture(fixture)
			if err != nil {
				t.Fatalf("Failed to load fixture %s: %v", fixture, err)
			}

			if len(data) == 0 {
				t.Errorf("Fixture %s is empty", fixture)
			}

			// Verify it's valid JSON
			var js json.RawMessage
			if err := json.Unmarshal(data, &js); err != nil {
				t.Errorf("Fixture %s contains invalid JSON: %v", fixture, err)
			}
		})
	}

	t.Logf("✅ All %d fixtures loaded successfully", len(fixtures))
}

// TestGitHubReposFixture tests loading GitHub repos fixture into a struct
func TestGitHubReposFixture(t *testing.T) {
	var repos []map[string]interface{}
	if err := LoadFixtureInto(GitHubReposSuccess, &repos); err != nil {
		t.Fatalf("Failed to load GitHub repos fixture: %v", err)
	}

	if len(repos) == 0 {
		t.Error("GitHub repos fixture should not be empty")
	}

	// Verify structure
	firstRepo := repos[0]
	requiredFields := []string{"id", "name", "full_name", "owner", "default_branch", "clone_url"}
	for _, field := range requiredFields {
		if _, ok := firstRepo[field]; !ok {
			t.Errorf("GitHub repo fixture missing required field: %s", field)
		}
	}

	t.Logf("✅ GitHub repos fixture has %d repos", len(repos))
}

// TestSnykProjectsFixture tests loading Snyk projects fixture
func TestSnykProjectsFixture(t *testing.T) {
	var response map[string]interface{}
	if err := LoadFixtureInto(SnykProjectsSuccess, &response); err != nil {
		t.Fatalf("Failed to load Snyk projects fixture: %v", err)
	}

	org, ok := response["org"].(map[string]interface{})
	if !ok {
		t.Fatal("Snyk projects fixture missing 'org' field")
	}

	if _, ok := org["id"]; !ok {
		t.Error("Org missing 'id' field")
	}

	projects, ok := response["projects"].([]interface{})
	if !ok {
		t.Fatal("Snyk projects fixture missing 'projects' array")
	}

	if len(projects) == 0 {
		t.Error("Snyk projects fixture should have at least one project")
	}

	t.Logf("✅ Snyk projects fixture has %d projects", len(projects))
}

// TestMustLoadFixturePanic tests that MustLoadFixture panics on invalid path
func TestMustLoadFixturePanic(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustLoadFixture should panic on invalid path")
		} else {
			t.Logf("✅ MustLoadFixture correctly panicked: %v", r)
		}
	}()

	// This should panic
	MustLoadFixture("nonexistent/file.json")
}

// TestManifestFixtures tests loading manifest fixtures
func TestManifestFixtures(t *testing.T) {
	manifestFixtures := []string{
		ManifestNodeJS,
		ManifestJava,
		ManifestPython,
		ManifestInfrastructure,
	}

	for _, fixture := range manifestFixtures {
		t.Run(fixture, func(t *testing.T) {
			var manifest map[string]interface{}
			if err := LoadFixtureInto(fixture, &manifest); err != nil {
				t.Fatalf("Failed to load manifest fixture: %v", err)
			}

			// Verify required fields
			requiredFields := []string{"owner", "name", "branch", "manifests", "projectTypes"}
			for _, field := range requiredFields {
				if _, ok := manifest[field]; !ok {
					t.Errorf("Manifest fixture missing required field: %s", field)
				}
			}
		})
	}

	t.Logf("✅ All %d manifest fixtures valid", len(manifestFixtures))
}

// TestSyncFixtures tests loading sync comparison fixtures
func TestSyncFixtures(t *testing.T) {
	var snykProjects []map[string]interface{}
	if err := LoadFixtureInto(SyncSnykProjects, &snykProjects); err != nil {
		t.Fatalf("Failed to load Snyk projects sync fixture: %v", err)
	}

	var scmRepos []map[string]interface{}
	if err := LoadFixtureInto(SyncSCMRepos, &scmRepos); err != nil {
		t.Fatalf("Failed to load SCM repos sync fixture: %v", err)
	}

	if len(snykProjects) == 0 {
		t.Error("Snyk projects sync fixture should not be empty")
	}

	if len(scmRepos) == 0 {
		t.Error("SCM repos sync fixture should not be empty")
	}

	// Verify structure
	if _, ok := snykProjects[0]["name"]; !ok {
		t.Error("Snyk project missing 'name' field")
	}

	if _, ok := scmRepos[0]["name"]; !ok {
		t.Error("SCM repo missing 'name' field")
	}

	t.Logf("✅ Sync fixtures loaded: %d Snyk projects, %d SCM repos", len(snykProjects), len(scmRepos))
}

// TestErrorFixtures tests that error fixtures have proper structure
func TestErrorFixtures(t *testing.T) {
	errorFixtures := map[string]string{
		"GitHub Unauthorized":    GitHubErrorUnauthorized,
		"GitHub Not Found":       GitHubErrorNotFound,
		"GitHub Rate Limit":      GitHubErrorRateLimit,
		"GitLab Unauthorized":    GitLabErrorUnauthorized,
		"Bitbucket Unauthorized": BitbucketErrorUnauthorized,
		"Azure Unauthorized":     AzureErrorUnauthorized,
		"Snyk Unauthorized":      SnykErrorUnauthorized,
		"Snyk Org Not Found":     SnykErrorOrgNotFound,
	}

	for name, fixture := range errorFixtures {
		t.Run(name, func(t *testing.T) {
			var errResp map[string]interface{}
			if err := LoadFixtureInto(fixture, &errResp); err != nil {
				t.Fatalf("Failed to load error fixture: %v", err)
			}

			// All error responses should have a message field (either at root or nested in "error")
			hasMessage := false
			if _, ok := errResp["message"]; ok {
				hasMessage = true
			} else if errObj, ok := errResp["error"].(map[string]interface{}); ok {
				if _, ok := errObj["message"]; ok {
					hasMessage = true
				}
			}

			if !hasMessage {
				t.Errorf("Error fixture %s missing 'message' field", name)
			}
		})
	}

	t.Logf("✅ All %d error fixtures have proper structure", len(errorFixtures))
}
