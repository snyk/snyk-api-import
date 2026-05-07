package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/snyk/snyk-api-import/internal/security"
)

// AzureFileTreeResult contains the results of tree-based file discovery for Azure DevOps
type AzureFileTreeResult struct {
	Organization   string
	Project        string
	Repository     string
	Branch         string
	CommitSHA      string
	SCAFiles       []string
	IaCFiles       []string
	ContainerFiles []string
	AllFiles       []string
	APICalls       int
	DiscoveryTime  time.Duration
	Error          error
}

// AzureItemsResponse represents the response from Azure DevOps Items API
type AzureItemsResponse struct {
	Count int         `json:"count"`
	Value []AzureItem `json:"value"`
}

// AzureItem represents a single item (file or folder) in Azure DevOps
type AzureItem struct {
	ObjectID      string `json:"objectId"`
	GitObjectType string `json:"gitObjectType"`
	CommitID      string `json:"commitId"`
	Path          string `json:"path"`
	IsFolder      bool   `json:"isFolder"`
	URL           string `json:"url"`
}

// DiscoverFilesViaAzureTree uses Azure DevOps Items API to discover all relevant files
// This is more efficient than cloning and works for all product types (SCA, IaC, Container)
// Azure Items API with recursionLevel=Full gets the entire tree in one API call
func DiscoverFilesViaAzureTree(ctx context.Context, auth AzureConfig, organization, project, repository, branch string) (*AzureFileTreeResult, error) {
	startTime := time.Now()
	result := &AzureFileTreeResult{
		Organization:   organization,
		Project:        project,
		Repository:     repository,
		Branch:         branch,
		SCAFiles:       make([]string, 0),
		IaCFiles:       make([]string, 0),
		ContainerFiles: make([]string, 0),
		AllFiles:       make([]string, 0),
	}

	// Validate inputs to prevent SSRF
	if !security.IsValidIdentifier(organization) {
		result.Error = fmt.Errorf("invalid organization name: %s", organization)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}
	if !security.IsValidIdentifier(project) {
		result.Error = fmt.Errorf("invalid project name: %s", project)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}
	if !security.IsValidIdentifier(repository) {
		result.Error = fmt.Errorf("invalid repository name: %s", repository)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	// Step 1: Get the commit SHA for the branch
	// Trim any whitespace from the branch name
	branch = strings.TrimSpace(branch)
	// Remove refs/heads/ prefix if present - Azure Items API expects just the branch name
	branch = strings.TrimPrefix(branch, "refs/heads/")
	branch = strings.TrimSpace(branch)

	Logger.Debugf("Azure API discovery: org=%s, project=%s, repo=%s, branch=%q", organization, project, repository, branch)

	// Build the Items API URL with recursionLevel=Full to get entire tree
	// Format: https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/items?
	//         scopePath=/&recursionLevel=Full&versionDescriptor.version={branch}&api-version=7.0
	itemsURL := fmt.Sprintf("%s/%s/%s/_apis/git/repositories/%s/items",
		auth.BaseURL, organization, project, repository)

	// Use security client for all HTTP requests
	client := security.NewClient()

	req, err := http.NewRequestWithContext(ctx, "GET", itemsURL, nil)
	if err != nil {
		result.Error = fmt.Errorf("create items request: %w", err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	// Add query parameters
	q := req.URL.Query()
	q.Add("scopePath", "/")
	q.Add("recursionLevel", "Full")
	q.Add("versionDescriptor.version", branch)
	q.Add("versionDescriptor.versionType", "branch")
	q.Add("api-version", "7.0")
	req.URL.RawQuery = q.Encode()

	// Azure uses Basic auth with PAT token
	req.SetBasicAuth("", auth.Token)
	req.Header.Set("Accept", "application/json")

	Logger.Debugf("Azure Items API request: GET %s", req.URL.String())

	resp, err := client.Do(req)
	result.APICalls++

	if err != nil {
		result.Error = fmt.Errorf("fetch items: %w", err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		result.Error = fmt.Errorf("items API returned %d: %s", resp.StatusCode, string(body))
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Error = fmt.Errorf("read items response: %w", err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	var itemsResp AzureItemsResponse
	if err := json.Unmarshal(body, &itemsResp); err != nil {
		result.Error = fmt.Errorf("unmarshal items response: %w", err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	Logger.Debugf("Azure Items API returned %d items for %s/%s/%s@%s",
		itemsResp.Count, organization, project, repository, branch)

	// Step 2: Parse items locally (no additional API calls)
	// Get commit SHA from first item
	for _, item := range itemsResp.Value {
		if item.CommitID != "" && result.CommitSHA == "" {
			result.CommitSHA = item.CommitID
		}

		// Only process files (blobs), not directories (trees)
		if item.IsFolder || item.GitObjectType == "tree" {
			continue
		}

		path := item.Path
		// Remove leading slash if present
		path = strings.TrimPrefix(path, "/")

		lowerPath := strings.ToLower(path)

		// Exclude common directories that should not be scanned
		if strings.Contains(lowerPath, "node_modules/") ||
			strings.Contains(lowerPath, "vendor/") ||
			strings.Contains(lowerPath, ".git/") ||
			strings.Contains(lowerPath, "test/") ||
			strings.Contains(lowerPath, "tests/") ||
			strings.Contains(lowerPath, "__tests__/") ||
			strings.Contains(lowerPath, "fixtures/") ||
			strings.Contains(lowerPath, "examples/") ||
			strings.Contains(lowerPath, ".venv/") ||
			strings.Contains(lowerPath, "venv/") ||
			strings.Contains(lowerPath, "dist/") ||
			strings.Contains(lowerPath, "build/") ||
			strings.Contains(lowerPath, ".terraform/") {
			continue
		}

		result.AllFiles = append(result.AllFiles, path)

		// Categorize by product type using shared functions from sync_helpers.go
		if isSCAFile(path) {
			result.SCAFiles = append(result.SCAFiles, path)
			Logger.Debugf("Found SCA file: %s", path)
			continue
		}

		if isContainerFile(path) {
			result.ContainerFiles = append(result.ContainerFiles, path)
			Logger.Debugf("Found Container file: %s", path)
			continue
		}

		if isIaCFile(path) {
			result.IaCFiles = append(result.IaCFiles, path)
			Logger.Debugf("Found IaC file: %s", path)
			continue
		}
	}

	result.DiscoveryTime = time.Since(startTime)

	Logger.Debugf("Azure tree discovery for %s/%s/%s@%s: %d SCA, %d IaC, %d Container files (total: %d) in %v",
		organization, project, repository, branch,
		len(result.SCAFiles), len(result.IaCFiles), len(result.ContainerFiles),
		len(result.AllFiles), result.DiscoveryTime)

	return result, nil
}

// DiscoverFilesViaAzureTreeBatch discovers files for multiple Azure repos in parallel
func DiscoverFilesViaAzureTreeBatch(ctx context.Context, auth AzureConfig, repos []AzureRepo, maxConcurrency int) ([]*AzureFileTreeResult, error) {
	if maxConcurrency <= 0 {
		maxConcurrency = 10
	}

	results := make([]*AzureFileTreeResult, len(repos))
	semaphore := make(chan struct{}, maxConcurrency)
	errChan := make(chan error, len(repos))
	resultChan := make(chan struct {
		index  int
		result *AzureFileTreeResult
	}, len(repos))

	// Process repos concurrently
	for i, repo := range repos {
		go func(index int, r AzureRepo) {
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			branch := r.DefaultBranch
			if branch == "" {
				branch = "main"
			}

			// Extract organization and project from repo
			organization := r.Project.Name // This should be the org name
			project := r.Project.Name
			repoName := r.Name

			result, err := DiscoverFilesViaAzureTree(ctx, auth, organization, project, repoName, branch)
			if err != nil {
				errChan <- fmt.Errorf("discover %s/%s/%s: %w", organization, project, repoName, err)
				return
			}

			resultChan <- struct {
				index  int
				result *AzureFileTreeResult
			}{index, result}
		}(i, repo)
	}

	// Collect results
	for i := 0; i < len(repos); i++ {
		select {
		case res := <-resultChan:
			results[res.index] = res.result
		case err := <-errChan:
			return nil, err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return results, nil
}
