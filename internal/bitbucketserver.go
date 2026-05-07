package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// BitbucketServerAuth holds Bitbucket Server authentication configuration
type BitbucketServerAuth struct {
	Token   string // Personal Access Token or HTTP Access Token
	BaseURL string // Bitbucket Server base URL (e.g., https://bitbucket.company.com)
}

// BitbucketServerProject represents a Bitbucket Server project
type BitbucketServerProject struct {
	Key  string `json:"key"`
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// BitbucketServerRepo represents a Bitbucket Server repository
type BitbucketServerRepo struct {
	Slug    string `json:"slug"` // Repository slug (name)
	Name    string `json:"name"` // Display name
	Project struct {
		Key  string `json:"key"`
		Name string `json:"name"`
	} `json:"project"`
}

// BitbucketServerRepoData holds minimal repo data for import
type BitbucketServerRepoData struct {
	ProjectKey string
	RepoSlug   string
}

// bitbucketServerProjectsResponse represents the API response for listing projects
type bitbucketServerProjectsResponse struct {
	Values        []BitbucketServerProject `json:"values"`
	IsLastPage    bool                     `json:"isLastPage"`
	NextPageStart int                      `json:"nextPageStart"`
}

// bitbucketServerReposResponse represents the API response for listing repos
type bitbucketServerReposResponse struct {
	Values        []BitbucketServerRepo `json:"values"`
	IsLastPage    bool                  `json:"isLastPage"`
	NextPageStart int                   `json:"nextPageStart"`
}

// GetBitbucketServerAuth retrieves Bitbucket Server authentication from environment
func GetBitbucketServerAuth() BitbucketServerAuth {
	token := os.Getenv("BITBUCKET_SERVER_TOKEN")
	if token == "" {
		Logger.Fatal("BITBUCKET_SERVER_TOKEN environment variable is required")
	}

	baseURL := os.Getenv("BITBUCKET_SERVER_URL")
	if baseURL == "" {
		Logger.Fatal("BITBUCKET_SERVER_URL environment variable is required (e.g., https://bitbucket.company.com)")
	}

	// Ensure base URL doesn't have trailing slash
	baseURL = strings.TrimSuffix(baseURL, "/")

	return BitbucketServerAuth{
		Token:   token,
		BaseURL: baseURL,
	}
}

// FetchBitbucketServerProjects fetches all projects from Bitbucket Server
func FetchBitbucketServerProjects(ctx context.Context, auth BitbucketServerAuth) ([]BitbucketServerProject, error) {
	var allProjects []BitbucketServerProject
	startFrom := 0
	limit := 100

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		apiURL := fmt.Sprintf("%s/rest/api/1.0/projects?start=%d&limit=%d", auth.BaseURL, startFrom, limit)
		Logger.Infof("Fetching Bitbucket Server projects from: %s", apiURL)

		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		req.Header.Set("Authorization", "Bearer "+auth.Token)
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetch projects: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		if closeErr := resp.Body.Close(); closeErr != nil {
			Logger.Warnf("failed to close response body: %v", closeErr)
		}
		if err != nil {
			return nil, fmt.Errorf("read response body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
		}

		var projectsResp bitbucketServerProjectsResponse
		if err := json.Unmarshal(body, &projectsResp); err != nil {
			return nil, fmt.Errorf("unmarshal projects response: %w", err)
		}

		allProjects = append(allProjects, projectsResp.Values...)

		Logger.Infof("Fetched %d projects (total: %d)", len(projectsResp.Values), len(allProjects))

		if projectsResp.IsLastPage {
			break
		}

		startFrom = projectsResp.NextPageStart
	}

	return allProjects, nil
}

// FetchBitbucketServerRepos fetches all repositories for a given project
func FetchBitbucketServerRepos(ctx context.Context, auth BitbucketServerAuth, projectName string) ([]BitbucketServerRepoData, error) {
	var allRepos []BitbucketServerRepoData
	startFrom := 0
	limit := 100

	// URL encode the project name for query string safety
	encodedProject := url.QueryEscape(projectName)

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		apiURL := fmt.Sprintf("%s/rest/api/1.0/repos?projectname=%s&state=AVAILABLE&start=%d&limit=%d",
			auth.BaseURL, encodedProject, startFrom, limit)
		Logger.Infof("Fetching repos for project '%s' from: %s", projectName, apiURL)

		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		req.Header.Set("Authorization", "Bearer "+auth.Token)
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetch repos: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		if closeErr := resp.Body.Close(); closeErr != nil {
			Logger.Warnf("failed to close response body: %v", closeErr)
		}
		if err != nil {
			return nil, fmt.Errorf("read response body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
		}

		var reposResp bitbucketServerReposResponse
		if err := json.Unmarshal(body, &reposResp); err != nil {
			return nil, fmt.Errorf("unmarshal repos response: %w", err)
		}

		// Filter repos that match the requested project
		// Note: projectName is actually the project KEY, not the name
		for _, repo := range reposResp.Values {
			if repo.Project.Key == projectName || repo.Project.Name == projectName {
				allRepos = append(allRepos, BitbucketServerRepoData{
					ProjectKey: repo.Project.Key,
					RepoSlug:   repo.Slug,
				})
			}
		}

		Logger.Infof("Fetched %d repos for project '%s' (total: %d)", len(reposResp.Values), projectName, len(allRepos))

		if reposResp.IsLastPage {
			break
		}

		startFrom = reposResp.NextPageStart
	}

	return allRepos, nil
}

// BitbucketServerProjectIsEmpty checks if a project has any repositories
func BitbucketServerProjectIsEmpty(ctx context.Context, auth BitbucketServerAuth, projectName string) (bool, error) {
	repos, err := FetchBitbucketServerRepos(ctx, auth, projectName)
	if err != nil {
		return false, err
	}
	return len(repos) == 0, nil
}

// DiscoverBitbucketServerManifests discovers manifest files in a Bitbucket Server repository
// by checking for files at their standard locations
func DiscoverBitbucketServerManifests(ctx context.Context, auth BitbucketServerAuth, projectKey, repoSlug, branch string, manifestTypes []string) []string {
	var discovered []string

	// Map manifest patterns to their standard file paths
	// We check the most common locations for each manifest type
	manifestPaths := map[string][]string{
		"pom.xml":              {"pom.xml"},
		"**/pom.xml":           {"pom.xml"},
		"build.gradle":         {"build.gradle", "build.gradle.kts"},
		"**/build.gradle":      {"build.gradle", "build.gradle.kts"},
		"package.json":         {"package.json"},
		"**/package.json":      {"package.json"},
		"requirements.txt":     {"requirements.txt"},
		"**/requirements.txt":  {"requirements.txt"},
		"Gemfile":              {"Gemfile"},
		"**/Gemfile":           {"Gemfile"},
		"Gemfile.lock":         {"Gemfile.lock"},
		"**/Gemfile.lock":      {"Gemfile.lock"},
		"go.mod":               {"go.mod"},
		"**/go.mod":            {"go.mod"},
		"composer.json":        {"composer.json"},
		"**/composer.json":     {"composer.json"},
		"Cargo.toml":           {"Cargo.toml"},
		"**/Cargo.toml":        {"Cargo.toml"},
		"yarn.lock":            {"yarn.lock"},
		"**/yarn.lock":         {"yarn.lock"},
		"package-lock.json":    {"package-lock.json"},
		"**/package-lock.json": {"package-lock.json"},
		"Pipfile":              {"Pipfile"},
		"**/Pipfile":           {"Pipfile"},
		"poetry.lock":          {"poetry.lock"},
		"**/poetry.lock":       {"poetry.lock"},
	}

	// For each manifest type, check if the file exists
	checkedPaths := make(map[string]bool)
	for _, manifestType := range manifestTypes {
		paths, ok := manifestPaths[manifestType]
		if !ok {
			// Unknown manifest type, skip
			continue
		}

		for _, filePath := range paths {
			if checkedPaths[filePath] {
				continue // Already checked this file
			}
			checkedPaths[filePath] = true

			// Check if file exists using Bitbucket Server API
			// GET /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/browse/{path}?at={branch}
			apiURL := fmt.Sprintf("%s/rest/api/1.0/projects/%s/repos/%s/browse/%s?at=%s",
				auth.BaseURL,
				url.PathEscape(projectKey),
				url.PathEscape(repoSlug),
				url.PathEscape(filePath),
				url.QueryEscape(branch))

			req, err := http.NewRequestWithContext(ctx, "HEAD", apiURL, nil)
			if err != nil {
				continue
			}

			req.Header.Set("Authorization", "Bearer "+auth.Token)

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				continue
			}
			if closeErr := resp.Body.Close(); closeErr != nil {
				Logger.Warnf("failed to close response body: %v", closeErr)
			}

			if resp.StatusCode == http.StatusOK {
				// File exists! Add the manifest type (not the path)
				discovered = append(discovered, manifestType)
				Logger.Debugf("Discovered manifest %s in %s/%s", manifestType, projectKey, repoSlug)
				break // Found this manifest type, no need to check other paths
			}
		}
	}

	return discovered
}
