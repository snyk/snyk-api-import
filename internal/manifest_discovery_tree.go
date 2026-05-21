package internal

import (
	"context"
	"fmt"
	"time"

	"github.com/google/go-github/v57/github"
)

// FileTreeResult contains the results of tree-based file discovery
type FileTreeResult struct {
	Owner          string
	Repo           string
	Branch         string
	CommitSHA      string
	TreeSHA        string
	SCAFiles       []string
	IaCFiles       []string
	ContainerFiles []string
	AllFiles       []string
	APICalls       int
	DiscoveryTime  time.Duration
	Error          error
}

// DiscoverFilesViaTree uses GitHub Tree API to discover all relevant files in one API call
// File classification is done using shared functions from sync_helpers.go for consistency
// This is more efficient than checking individual paths and works for all product types
func DiscoverFilesViaTree(ctx context.Context, client *github.Client, owner, repo, branch string) (*FileTreeResult, error) {
	startTime := time.Now()
	result := &FileTreeResult{
		Owner:          owner,
		Repo:           repo,
		Branch:         branch,
		SCAFiles:       make([]string, 0),
		IaCFiles:       make([]string, 0),
		ContainerFiles: make([]string, 0),
		AllFiles:       make([]string, 0),
	}

	// Step 1: Get branch to get commit SHA
	branchRef, _, err := client.Repositories.GetBranch(ctx, owner, repo, branch, 0)
	result.APICalls++
	if err != nil {
		result.Error = fmt.Errorf("get branch %s: %w", branch, err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	if branchRef.Commit == nil || branchRef.Commit.SHA == nil {
		result.Error = fmt.Errorf("branch %s has no commit SHA", branch)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	result.CommitSHA = *branchRef.Commit.SHA

	// Step 2: Get the tree (recursive=true gets entire tree in one call)
	tree, _, err := client.Git.GetTree(ctx, owner, repo, result.CommitSHA, true)
	result.APICalls++
	if err != nil {
		result.Error = fmt.Errorf("get tree for commit %s: %w", result.CommitSHA, err)
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	if tree.SHA == nil {
		result.Error = fmt.Errorf("tree has no SHA")
		result.DiscoveryTime = time.Since(startTime)
		return result, result.Error
	}

	result.TreeSHA = *tree.SHA

	// Step 3: Parse tree entries locally (no additional API calls)
	for _, entry := range tree.Entries {
		if entry.Path == nil || entry.Type == nil {
			continue
		}

		path := *entry.Path
		entryType := *entry.Type

		// Only process files (blobs), not directories (trees)
		if entryType != "blob" {
			continue
		}

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

	Logger.Debugf("Tree discovery for %s/%s@%s: %d SCA, %d IaC, %d Container files (total: %d) in %v",
		owner, repo, branch,
		len(result.SCAFiles), len(result.IaCFiles), len(result.ContainerFiles),
		len(result.AllFiles), result.DiscoveryTime)

	return result, nil
}

// DiscoverFilesViaTreeBatch discovers files for multiple repos in parallel
func DiscoverFilesViaTreeBatch(ctx context.Context, client *github.Client, repos []map[string]string, maxConcurrency int) ([]*FileTreeResult, error) {
	if maxConcurrency <= 0 {
		maxConcurrency = 10
	}

	results := make([]*FileTreeResult, len(repos))
	semaphore := make(chan struct{}, maxConcurrency)
	errChan := make(chan error, len(repos))
	resultChan := make(chan struct {
		index  int
		result *FileTreeResult
	}, len(repos))

	// Process repos concurrently
	for i, repo := range repos {
		go func(index int, r map[string]string) {
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			owner := r["owner"]
			name := r["name"]
			branch := r["branch"]
			if branch == "" {
				branch = "main"
			}

			result, err := DiscoverFilesViaTree(ctx, client, owner, name, branch)
			if err != nil {
				errChan <- fmt.Errorf("discover %s/%s: %w", owner, name, err)
				return
			}

			resultChan <- struct {
				index  int
				result *FileTreeResult
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
