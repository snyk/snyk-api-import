package testdata

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// LoadFixture loads a JSON fixture file from the testdata directory
func LoadFixture(path string) ([]byte, error) {
	_, filename, _, _ := runtime.Caller(0)
	dir := filepath.Dir(filename)
	fullPath := filepath.Join(dir, path)
	return os.ReadFile(fullPath)
}

// LoadFixtureInto loads a JSON fixture and unmarshals it into the provided interface
func LoadFixtureInto(path string, v interface{}) error {
	data, err := LoadFixture(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// MustLoadFixture loads a fixture or panics (for use in test setup)
func MustLoadFixture(path string) []byte {
	data, err := LoadFixture(path)
	if err != nil {
		panic("failed to load fixture " + path + ": " + err.Error())
	}
	return data
}

// MustLoadFixtureInto loads and unmarshals a fixture or panics
func MustLoadFixtureInto(path string, v interface{}) {
	if err := LoadFixtureInto(path, v); err != nil {
		panic("failed to load fixture " + path + ": " + err.Error())
	}
}

// GitHub fixtures
const (
	GitHubReposSuccess      = "github/repos_success.json"
	GitHubErrorUnauthorized = "github/error_unauthorized.json"
	GitHubErrorNotFound     = "github/error_not_found.json"
	GitHubErrorRateLimit    = "github/error_rate_limit.json"
)

// GitLab fixtures
const (
	GitLabProjectsSuccess   = "gitlab/projects_success.json"
	GitLabErrorUnauthorized = "gitlab/error_unauthorized.json"
)

// Bitbucket Cloud fixtures
const (
	BitbucketReposSuccess      = "bitbucket-cloud/repos_success.json"
	BitbucketErrorUnauthorized = "bitbucket-cloud/error_unauthorized.json"
)

// Azure DevOps fixtures
const (
	AzureReposSuccess      = "azure/repos_success.json"
	AzureProjectsSuccess   = "azure/projects_success.json"
	AzureErrorUnauthorized = "azure/error_unauthorized.json"
)

// Snyk API fixtures
const (
	SnykProjectsSuccess     = "snyk/projects_success.json"
	SnykIntegrationsSuccess = "snyk/integrations_success.json"
	SnykErrorUnauthorized   = "snyk/error_unauthorized.json"
	SnykErrorOrgNotFound    = "snyk/error_org_not_found.json"
)

// Manifest fixtures
const (
	ManifestNodeJS         = "manifests/nodejs_project.json"
	ManifestJava           = "manifests/java_project.json"
	ManifestPython         = "manifests/python_project.json"
	ManifestInfrastructure = "manifests/infrastructure_project.json"
)

// Sync fixtures
const (
	SyncSnykProjects = "sync/snyk_projects.json"
	SyncSCMRepos     = "sync/scm_repos.json"
)
