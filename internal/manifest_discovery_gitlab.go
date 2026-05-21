package internal

import (
	"context"
	"fmt"
	"time"

	gitlab "gitlab.com/gitlab-org/api/client-go"
)

// GitLabFileTreeResult contains the results of tree-based file discovery for GitLab
type GitLabFileTreeResult struct {
	ProjectID      int
	ProjectPath    string
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

// DiscoverFilesViaGitLabTree uses GitLab Repository Tree API to discover all relevant files
// This is more efficient than cloning and works for all product types (SCA, IaC, Container)
func DiscoverFilesViaGitLabTree(ctx context.Context, client *gitlab.Client, projectID int, projectPath, branch string) (*GitLabFileTreeResult, error) {
	startTime := time.Now()
	result := &GitLabFileTreeResult{
		ProjectID:      projectID,
		ProjectPath:    projectPath,
		Branch:         branch,
		SCAFiles:       make([]string, 0),
		IaCFiles:       make([]string, 0),
		ContainerFiles: make([]string, 0),
		AllFiles:       make([]string, 0),
	}

	// Step 1: Get the commit SHA for the branch
	branchInfo, _, err := client.Branches.GetBranch(projectID, branch)
	result.APICalls++
	if err != nil {
		result.Error = fmt.Errorf("get branch %s: %w", branch, err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	if branchInfo.Commit == nil || branchInfo.Commit.ID == "" {
		result.Error = fmt.Errorf("branch %s has no commit SHA", branch)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	result.CommitSHA = branchInfo.Commit.ID

	// Step 2: Get the repository tree recursively
	// GitLab's ListTree with Recursive=true gets the entire tree in one call
	recursive := true
	opt := &gitlab.ListTreeOptions{
		Recursive: &recursive,
		Ref:       &branch,
		ListOptions: gitlab.ListOptions{
			PerPage: 100, // Max per page
		},
	}

	var allNodes []*gitlab.TreeNode
	page := 1

	for {
		opt.Page = page
		nodes, resp, err := client.Repositories.ListTree(projectID, opt)
		result.APICalls++

		if err != nil {
			result.Error = fmt.Errorf("list tree for commit %s: %w", result.CommitSHA, err)
			result.DiscoveryTime = time.Since(startTime)
			return result, result.Error
		}

		allNodes = append(allNodes, nodes...)

		// Check if there are more pages
		if resp.NextPage == 0 {
			break
		}
		page = resp.NextPage
	}

	// Step 3: Parse tree nodes locally (no additional API calls)
	for _, node := range allNodes {
		// Only process files (blobs), not directories (trees)
		if node.Type != "blob" {
			continue
		}

		path := node.Path

		if PathExcludedByDiscovery(path, DiscoveryExclusionGlobs()) {
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

	Logger.Debugf("GitLab tree discovery for %s@%s: %d SCA, %d IaC, %d Container files (total: %d) in %v",
		projectPath, branch,
		len(result.SCAFiles), len(result.IaCFiles), len(result.ContainerFiles),
		len(result.AllFiles), result.DiscoveryTime)

	return result, nil
}

// DiscoverFilesViaGitLabTreeBatch discovers files for multiple GitLab projects in parallel
func DiscoverFilesViaGitLabTreeBatch(ctx context.Context, client *gitlab.Client, projects []GitLabRepo, maxConcurrency int) ([]*GitLabFileTreeResult, error) {
	if maxConcurrency <= 0 {
		maxConcurrency = 10
	}

	results := make([]*GitLabFileTreeResult, len(projects))
	semaphore := make(chan struct{}, maxConcurrency)
	errChan := make(chan error, len(projects))
	resultChan := make(chan struct {
		index  int
		result *GitLabFileTreeResult
	}, len(projects))

	// Process projects concurrently
	for i, project := range projects {
		go func(index int, proj GitLabRepo) {
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			branch := proj.DefaultBranch
			if branch == "" {
				branch = "main"
			}

			result, err := DiscoverFilesViaGitLabTree(ctx, client, proj.ID, proj.PathWithNamespace, branch)
			if err != nil {
				errChan <- fmt.Errorf("discover %s: %w", proj.PathWithNamespace, err)
				return
			}

			resultChan <- struct {
				index  int
				result *GitLabFileTreeResult
			}{index, result}
		}(i, project)
	}

	// Collect results
	for i := 0; i < len(projects); i++ {
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
