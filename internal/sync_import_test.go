package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/snyk/snyk-api-import/internal/security"
)

func TestBuildImportTargetsFromSyncMaps_GitHubPerManifest(t *testing.T) {
	maps := []map[string]interface{}{
		{
			"name": "repo-a", "owner": "org-a", "branch": "main",
			"manifest": "package.json",
		},
		{
			"name": "repo-a", "owner": "org-a", "branch": "main",
			"manifest": "Gemfile",
		},
	}
	targets := BuildImportTargetsFromSyncMaps("github", "org-1", "int-1", maps)
	require.Len(t, targets, 2)
	assert.Equal(t, "package.json", targets[0].Files[0].Path)
	assert.Equal(t, "Gemfile", targets[1].Files[0].Path)
	require.NotNil(t, targets[0].ExclusionGlobs)
	assert.Contains(t, *targets[0].ExclusionGlobs, "fixtures")
	assert.Contains(t, *targets[0].ExclusionGlobs, "node_modules")
	assert.Equal(t, targets[0].ExclusionGlobs, targets[1].ExclusionGlobs)
}

func TestBuildImportTargetsFromSyncMaps_SkipsEmptyManifest(t *testing.T) {
	maps := []map[string]interface{}{
		{"name": "r", "owner": "o", "manifest": ""},
		{"name": "r2", "owner": "o", "manifest": "pom.xml"},
	}
	targets := BuildImportTargetsFromSyncMaps("github", "org", "int", maps)
	require.Len(t, targets, 1)
	assert.Equal(t, "pom.xml", targets[0].Files[0].Path)
}

func TestBuildImportTargetsFromSyncMaps_BitbucketServer(t *testing.T) {
	maps := []map[string]interface{}{
		{
			"projectKey": "PROJ", "repoSlug": "my-repo", "branch": "develop",
			"manifest": "build.gradle",
		},
	}
	targets := BuildImportTargetsFromSyncMaps("bitbucket-server", "org", "int", maps)
	require.Len(t, targets, 1)
	assert.Equal(t, "PROJ", targets[0].Target.ProjectKey)
	assert.Equal(t, "my-repo", targets[0].Target.RepoSlug)
	assert.Equal(t, "develop", targets[0].Target.Branch)
	assert.Equal(t, "build.gradle", targets[0].Files[0].Path)
}

func TestCompareStatesMissing_ImportTargetCountMatchesManifests(t *testing.T) {
	snykProjects := []map[string]interface{}{
		{"name": "repo", "owner": "org", "branch": "main", "manifest": "package.json"},
	}
	sourceRepos := []map[string]interface{}{
		{"name": "repo", "owner": "org", "branch": "main", "manifest": "package.json"},
		{"name": "repo", "owner": "org", "branch": "main", "manifest": "Gemfile"},
		{"name": "repo", "owner": "org", "branch": "main", "manifest": "pom.xml"},
	}
	res := CompareStates(snykProjects, sourceRepos, nil)
	require.Len(t, res.Missing, 2)
	targets := BuildImportTargetsFromSyncMaps("github", "org", "int", res.Missing)
	assert.Len(t, targets, len(res.Missing))
}

func TestImportTargetFiles_SendsFilesAndExclusions(t *testing.T) {
	var lastBody map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/import") {
			_ = json.NewDecoder(r.Body).Decode(&lastBody)
			w.Header().Set("Location", "/api/v1/org/test-org/integrations/test-int/import/job-123")
			w.WriteHeader(http.StatusCreated)
		}
	}))
	defer server.Close()

	serverURL := strings.TrimPrefix(server.URL, "http://")
	os.Setenv("SNYK_API", server.URL)
	os.Setenv("SNYK_SKIP_POLL", "1")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	defer os.Unsetenv("SNYK_API")
	defer os.Unsetenv("SNYK_SKIP_POLL")
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	maps := []map[string]interface{}{
		{"name": "repo1", "owner": "org1", "branch": "main", "manifest": "package.json"},
	}
	importTargets := BuildImportTargetsFromSyncMaps("github", "test-org", "test-int", maps)
	require.Len(t, importTargets, 1)

	config := ParallelImportConfig{
		OrgID: "test-org", IntegrationID: "test-int", Source: "github",
		Concurrency: 1, SnykToken: "test-token", PollTimeout: time.Second,
	}
	mockClient := &http.Client{Timeout: 10 * time.Second}
	restore := security.SetTestHTTPClient(mockClient, []string{serverURL})
	defer restore()

	_, err := ParallelImport(context.Background(), importTargets, config)
	require.NoError(t, err)
	require.NotNil(t, lastBody)
	assert.Contains(t, lastBody["exclusionGlobs"].(string), "fixtures")
	files, ok := lastBody["files"].([]interface{})
	require.True(t, ok)
	require.Len(t, files, 1)
	file0, ok := files[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "package.json", file0["path"])
}
