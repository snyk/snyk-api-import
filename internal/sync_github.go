package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"
)

// DiscoverManifestsOptimized uses API-first approach with caching for manifest discovery
// This is significantly faster than cloning for large-scale operations
func DiscoverManifestsOptimized(ctx context.Context, auth GitHubAuth, orgName string, manifestTypes []string, cacheDir string, snykOrgID string) ([]map[string]interface{}, error) {
	startTime := time.Now()

	// Create GitHub client for API calls
	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: auth.Token})
	tc := oauth2.NewClient(ctx, ts)
	var githubClient *github.Client
	var err error

	if auth.BaseURL != "" && auth.BaseURL != "https://api.github.com" {
		githubClient, err = github.NewClient(tc).WithEnterpriseURLs(auth.BaseURL, auth.BaseURL)
		if err != nil {
			return nil, fmt.Errorf("create GitHub enterprise client: %w", err)
		}
	} else {
		githubClient = github.NewClient(tc)
	}

	// Load manifest cache
	cache, err := LoadManifestCache(cacheDir, snykOrgID)
	if err != nil {
		Logger.Warnf("Failed to load manifest cache: %v, starting with empty cache", err)
		cache = NewManifestCache(snykOrgID)
	}

	// Fetch basic repo list
	Logger.Infof("Fetching repository list for org: %s", orgName)
	repos, err := FetchGitHubRepos(ctx, auth, orgName, nil)
	if err != nil {
		return nil, fmt.Errorf("fetch repos: %w", err)
	}
	Logger.Infof("Found %d repositories in org %s", len(repos), orgName)

	// Track performance metrics
	var (
		apiDiscoveries int
		cacheHits      int
		cloneFallbacks int
		totalAPICalls  int
		totalManifests int
	)

	var enrichedRepos []map[string]interface{}

	// Process each repo
	for i, repo := range repos {
		owner := repo["owner"]
		name := repo["name"]
		branch := repo["branch"]
		if branch == "" {
			branch = "main"
		}

		Logger.Debugf("[%d/%d] Processing %s/%s@%s", i+1, len(repos), owner, name, branch)

		// Step 1: Check if we need to discover (get current commit SHA first)
		branchRef, _, err := githubClient.Repositories.GetBranch(ctx, owner, name, branch, 0)
		totalAPICalls++

		if err != nil {
			Logger.Warnf("Failed to get branch info for %s/%s@%s: %v", owner, name, branch, err)
			continue
		}

		currentSHA := ""
		if branchRef.Commit != nil && branchRef.Commit.SHA != nil {
			currentSHA = *branchRef.Commit.SHA
		}

		// Step 2: Check cache validity
		if cache.IsValid(owner, name, branch, currentSHA) {
			// Cache hit - use cached files (all product types)
			entry, _ := cache.Get(owner, name, branch)
			cacheHits++

			// Get all files (SCA + IaC + Container)
			allFiles := entry.GetAllFiles()

			// Filter out lock files that aren't primary import targets
			var importableFiles []string
			for _, f := range allFiles {
				lowerFile := strings.ToLower(f)
				lowerBase := strings.ToLower(filepath.Base(f))
				// Exclude lock files that are dependency resolution artifacts, not primary manifests
				if !strings.HasSuffix(lowerFile, "-lock.json") &&
					!strings.HasSuffix(lowerFile, ".lock") &&
					!strings.HasSuffix(lowerFile, "lockfile") &&
					lowerBase != "go.sum" {
					importableFiles = append(importableFiles, f)
				}
			}

			Logger.Debugf("Cache HIT for %s/%s@%s (SHA: %s, %d importable files from %d total: %d SCA, %d IaC, %d Container)",
				owner, name, branch, currentSHA[:8], len(importableFiles), len(allFiles),
				len(entry.SCAFiles), len(entry.IaCFiles), len(entry.ContainerFiles))

			// Add each file as a separate entry
			// Only add entries if there are actual files found
			if len(importableFiles) > 0 {
				for _, manifest := range importableFiles {
					enrichedRepos = append(enrichedRepos, map[string]interface{}{
						"owner":      owner,
						"name":       name,
						"branch":     branch,
						"manifest":   manifest,
						"commit_sha": currentSHA,
					})
					totalManifests++
				}
			}
			// If no importable files, skip this repo (don't add empty manifest entry)
			continue
		}

		// Step 3: Cache miss - discover via Tree API
		Logger.Debugf("Cache MISS for %s/%s@%s (SHA: %s), discovering via Tree API...",
			owner, name, branch, currentSHA[:8])

		treeResult, err := DiscoverFilesViaTree(ctx, githubClient, owner, name, branch)
		totalAPICalls += treeResult.APICalls

		if err != nil {
			Logger.Warnf("Tree discovery failed for %s/%s: %v, skipping repo", owner, name, err)
			// Cache the failure to avoid repeated attempts
			entry := CachedRepoEntry{
				Owner:           owner,
				Repo:            name,
				Branch:          branch,
				CommitSHA:       currentSHA,
				SCAFiles:        []string{},
				IaCFiles:        []string{},
				ContainerFiles:  []string{},
				DiscoveryMethod: "tree-failed",
				LastChecked:     time.Now(),
				APICalls:        treeResult.APICalls,
			}
			cache.SetEntry(owner, name, branch, entry)
			continue
		}

		// Tree discovery succeeded
		apiDiscoveries++

		// Get all files (SCA + IaC + Container)
		allFiles := make([]string, 0, len(treeResult.SCAFiles)+len(treeResult.IaCFiles)+len(treeResult.ContainerFiles))
		allFiles = append(allFiles, treeResult.SCAFiles...)
		allFiles = append(allFiles, treeResult.IaCFiles...)
		allFiles = append(allFiles, treeResult.ContainerFiles...)

		// Filter out lock files that aren't primary import targets
		var importableFiles []string
		for _, f := range allFiles {
			lowerFile := strings.ToLower(f)
			lowerBase := strings.ToLower(filepath.Base(f))
			// Exclude lock files that are dependency resolution artifacts, not primary manifests
			if !strings.HasSuffix(lowerFile, "-lock.json") &&
				!strings.HasSuffix(lowerFile, ".lock") &&
				!strings.HasSuffix(lowerFile, "lockfile") &&
				lowerBase != "go.sum" {
				importableFiles = append(importableFiles, f)
			}
		}

		Logger.Debugf("Tree discovery succeeded for %s/%s: found %d importable files from %d total (%d SCA, %d IaC, %d Container) in %v (%d API calls)",
			owner, name, len(importableFiles), len(allFiles),
			len(treeResult.SCAFiles), len(treeResult.IaCFiles), len(treeResult.ContainerFiles),
			treeResult.DiscoveryTime, treeResult.APICalls)

		// Update cache with tree results (using new product-specific fields)
		entry := CachedRepoEntry{
			Owner:           owner,
			Repo:            name,
			Branch:          branch,
			CommitSHA:       currentSHA,
			TreeSHA:         treeResult.TreeSHA,
			SCAFiles:        treeResult.SCAFiles,
			IaCFiles:        treeResult.IaCFiles,
			ContainerFiles:  treeResult.ContainerFiles,
			DiscoveryMethod: "tree",
			LastChecked:     time.Now(),
			APICalls:        treeResult.APICalls,
		}
		cache.SetEntry(owner, name, branch, entry)

		// Add to enriched repos (one entry per file)
		// Only add entries if there are actual files found
		if len(importableFiles) > 0 {
			for _, manifest := range importableFiles {
				enrichedRepos = append(enrichedRepos, map[string]interface{}{
					"owner":      owner,
					"name":       name,
					"branch":     branch,
					"manifest":   manifest,
					"commit_sha": currentSHA,
				})
				totalManifests++
			}
		}
		// If no importable files, skip this repo (don't add empty manifest entry)
	}

	// Save updated cache
	if err := cache.Save(cacheDir); err != nil {
		Logger.Warnf("Failed to save manifest cache: %v", err)
	}

	// Log performance metrics
	duration := time.Since(startTime)
	Logger.Infof("Manifest discovery completed in %v", duration)
	Logger.Infof("Performance metrics:")
	Logger.Infof("  - Total repositories: %d", len(repos))
	Logger.Infof("  - Total manifests found: %d", totalManifests)
	Logger.Infof("  - Cache hits: %d (%.1f%%)", cacheHits, float64(cacheHits)/float64(len(repos))*100)
	Logger.Infof("  - API discoveries: %d (%.1f%%)", apiDiscoveries, float64(apiDiscoveries)/float64(len(repos))*100)
	Logger.Infof("  - Clone fallbacks: %d (%.1f%%)", cloneFallbacks, float64(cloneFallbacks)/float64(len(repos))*100)
	Logger.Infof("  - Total API calls: %d (avg %.1f per repo)", totalAPICalls, float64(totalAPICalls)/float64(len(repos)))
	Logger.Infof("  - Avg time per repo: %v", duration/time.Duration(len(repos)))

	// Log cache stats
	stats := cache.GetStats()
	Logger.Infof("Cache statistics:")
	Logger.Infof("  - Total cached repos: %d", stats.TotalRepos)
	Logger.Infof("  - Total cached manifests: %d", stats.TotalManifests)
	Logger.Infof("  - Cache hit rate: %.1f%%", float64(stats.CacheHits)/float64(stats.CacheHits+stats.CacheMisses)*100)

	return enrichedRepos, nil
}

// SyncGitHub performs sync for GitHub using API-first manifest discovery
func SyncGitHub(orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool, useCache bool) error {
	ctx := context.Background()
	return SyncGitHubContext(ctx, orgID, source, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback, useCache)
}

// SyncGitHubContext performs sync for GitHub with context support
func SyncGitHubContext(ctx context.Context, orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool, useCache bool) error {
	startTime := time.Now()

	Logger.Info("Using optimized sync with API-first manifest discovery and caching")

	// Validate SNYK_LOG_PATH
	if snykLogPath == "" {
		snykLogPath = os.Getenv("SNYK_LOG_PATH")
		if snykLogPath == "" {
			return fmt.Errorf("SNYK_LOG_PATH environment variable is not set")
		}
	}

	// Validate required environment variables
	snykToken := os.Getenv("SNYK_TOKEN")
	if orgID == "" {
		orgID = os.Getenv("ORG_ID")
	}

	// Get GitHub auth based on source type
	// Each integration type uses its specific authentication method
	var auth GitHubAuth
	var err error

	if source == "github-cloud-app" {
		// GitHub Cloud App integration requires GitHub App credentials
		appConfig, appErr := GetGitHubAppConfig()
		if appErr != nil {
			return fmt.Errorf("github-cloud-app source requires GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY): %w", appErr)
		}

		// Get installation token
		token, tokenErr := FetchGitHubAppToken(ctx, appConfig)
		if tokenErr != nil {
			return fmt.Errorf("fetch GitHub App token: %w", tokenErr)
		}

		// Create auth with installation token
		baseURL := os.Getenv("GITHUB_API_URL")
		if baseURL == "" {
			baseURL = "https://api.github.com"
		}
		auth = GitHubAuth{
			Token:   token,
			BaseURL: baseURL,
		}
		Logger.Infof("Using GitHub App authentication")
	} else {
		// GitHub integration (github, github-com, github-enterprise) requires Personal Access Token
		auth, err = GetGitHubAuth()
		if err != nil {
			return fmt.Errorf("get GitHub auth (GITHUB_TOKEN required): %w", err)
		}
		Logger.Infof("Using GitHub authentication (Personal Access Token)")
	}

	if snykToken == "" || orgID == "" {
		return fmt.Errorf("required environment variables not set: SNYK_TOKEN and/or ORG_ID")
	}

	// Read targets file
	var targets struct {
		Targets []struct {
			Target struct {
				Fork   bool   `json:"fork"`
				Name   string `json:"name"`
				Owner  string `json:"owner"`
				Branch string `json:"branch"`
			} `json:"target"`
			OrgID         string `json:"orgID"`
			IntegrationID string `json:"integrationID,omitempty"`
		} `json:"targets"`
	}

	if targetsFile != "" {
		// Only allow targets file reads from inside SNYK_LOG_PATH for safety
		absLogPath, absLogErr := filepath.Abs(snykLogPath)
		absTargets, targetsErr := filepath.Abs(targetsFile)
		if absLogErr != nil || targetsErr != nil || !strings.HasPrefix(absTargets, absLogPath+string(os.PathSeparator)) {
			Logger.Warnf("targets file %s is not located within SNYK_LOG_PATH %s; ignoring for safety", targetsFile, snykLogPath)
		} else {
			if targetsData, err := os.ReadFile(absTargets); err != nil {
				if os.IsNotExist(err) {
					Logger.Debugf("targets file not found at %s; proceeding without targets", absTargets)
				} else {
					return fmt.Errorf("read targets file: %w", err)
				}
			} else {
				if err := json.Unmarshal(targetsData, &targets); err != nil {
					return fmt.Errorf("unmarshal targets: %w", err)
				}
			}
		}
	}

	// Define manifest types
	manifestTypes := getDefaultManifestTypes()

	// Fetch Snyk projects
	snykProjectsRaw, err := FetchSnykProjects(ctx, orgID, snykToken, manifestTypes)
	if err != nil {
		return fmt.Errorf("fetch snyk projects: %w", err)
	}
	Logger.Debugf("Fetched %d Snyk projects", len(snykProjectsRaw))

	// Build org set from targets
	orgSet := make(map[string]bool)
	for _, t := range targets.Targets {
		if t.OrgID != "" && t.OrgID != orgID {
			continue
		}
		orgSet[t.Target.Owner] = true
	}

	// If no targets found, extract GitHub orgs from existing Snyk projects
	// Note: We extract from all projects since FetchSnykProjects already filters by origin
	if len(orgSet) == 0 {
		Logger.Info("No targets file found, extracting GitHub orgs from existing Snyk projects")
		for _, p := range snykProjectsRaw {
			name := p["name"]
			if name != "" {
				// Parse owner from name (format: "owner/repo:manifest")
				parts := strings.Split(name, "/")
				if len(parts) >= 2 {
					owner := parts[0]
					orgSet[owner] = true
					Logger.Debugf("Extracted GitHub org: %s from project: %s", owner, name)
				}
			}
		}
		Logger.Infof("Extracted %d GitHub org(s) from Snyk projects", len(orgSet))
		for org := range orgSet {
			Logger.Infof("  - %s", org)
		}
	}

	// Discover manifests for all orgs using optimized approach
	discoveryStart := time.Now()
	var githubRepos []map[string]interface{}
	cacheDir := "" // Will use default $SNYK_LOG_PATH/cache/

	for org := range orgSet {
		Logger.Infof("Processing GitHub org: %s (optimized)", org)

		enrichedRepos, err := DiscoverManifestsOptimized(ctx, auth, org, manifestTypes, cacheDir, orgID)
		if err != nil {
			Logger.Warnf("Failed to discover manifests for org %s: %v", org, err)
			continue
		}

		githubRepos = append(githubRepos, enrichedRepos...)
	}
	discoveryDuration := time.Since(discoveryStart)

	// Filter discovered files by product type if specified
	snykProductFilter := os.Getenv("SNYK_PRODUCT")
	if snykProductFilter != "" {
		Logger.Infof("Filtering discovered files for product type: %s", snykProductFilter)
		filteredRepos := make([]map[string]interface{}, 0)

		for _, repo := range githubRepos {
			manifest, _ := repo["manifest"].(string)
			include := false

			switch snykProductFilter {
			case "openSource":
				// Check if it's an SCA manifest
				include = isSCAFile(manifest)
			case "container":
				// Check if it's a container file
				include = isContainerFile(manifest)
			case "iac":
				// Check if it's an IaC file
				include = isIaCFile(manifest)
			}

			if include {
				filteredRepos = append(filteredRepos, repo)
			}
		}

		Logger.Infof("Filtered discovered files from %d to %d for product: %s",
			len(githubRepos), len(filteredRepos), snykProductFilter)
		githubRepos = filteredRepos
	}

	// Convert snykProjectsRaw to []map[string]interface{} and filter inactive projects
	snykProjects := make([]map[string]interface{}, 0, len(snykProjectsRaw))
	for _, p := range snykProjectsRaw {
		// Skip inactive projects - no need to compare or deactivate them
		if status := p["status"]; status == "inactive" {
			Logger.Debugf("Skipping inactive project: %s", p["name"])
			continue
		}
		m := make(map[string]interface{})
		for k, v := range p {
			m[k] = v
		}
		snykProjects = append(snykProjects, m)
	}

	// Apply product filter if specified using shared function
	snykProjects = FilterSnykProjectsByProduct(snykProjects, snykProductFilter)

	if snykProductFilter != "" {
		Logger.Infof("Filtered to %d Snyk projects (product: %s) out of %d total for comparison",
			len(snykProjects), snykProductFilter, len(snykProjectsRaw))
	} else {
		Logger.Infof("Comparing %d Snyk projects (all product types) with discovered files", len(snykProjects))
	}

	// Compare states (same as original)
	result := CompareStates(snykProjects, githubRepos, manifestTypes)

	Logger.Infof("Sync comparison results:")
	Logger.Infof("- Missing files to import: %d", len(result.Missing))
	Logger.Infof("- Stale projects to deactivate: %d", len(result.Stale))
	if len(result.ImportableEmpty) > 0 {
		Logger.Infof("- Repos with no manifests: %d (will be skipped)", len(result.ImportableEmpty))
	}
	Logger.Infof("- Branch updates needed: %d", len(result.BranchUpdates))

	// Dry-run mode: just show what would be done
	if dryRun {
		PrintDryRunSummary(result, discoveryDuration, time.Since(startTime), source, nil)
		return nil
	}

	// Collect project IDs for deactivation (stale projects)
	var deactivateIDs []string
	for _, p := range result.Stale {
		if idv, ok := p["id"]; ok {
			if idStr, ok2 := idv.(string); ok2 && idStr != "" {
				deactivateIDs = append(deactivateIDs, idStr)
			}
		}
	}

	// Snyk org integration type must match the sync source (github, github-cloud-app, github-enterprise)
	integrationKey := "github"
	switch source {
	case "github-enterprise":
		integrationKey = "github-enterprise"
	case "github-cloud-app":
		integrationKey = "github-cloud-app"
	}

	// Execute branch updates via PATCH (update target_reference) with fallback
	if err := HandleBranchUpdates(ctx, orgID, result.BranchUpdates, integrationKey, performGitHubImports, enableBranchUpdateFallback); err != nil {
		Logger.Errorf("Branch update handler error: %v", err)
	}

	// Execute imports for missing repos
	if len(result.Missing) > 0 {
		Logger.Infof("Importing %d missing files to Snyk", len(result.Missing))

		integrations, err := ListIntegrations(ctx, orgID)
		if err != nil {
			return fmt.Errorf("list integrations: %w", err)
		}

		Logger.Debugf("Available integrations for org %s: %+v", orgID, integrations)

		integrationID, ok := integrations[integrationKey]
		if !ok {
			return fmt.Errorf("no %s integration found for org %s (available: %v)", integrationKey, orgID, integrations)
		}

		Logger.Infof("Using integration ID: %s", integrationID)

		err = performGitHubImports(ctx, result.Missing, orgID, integrationID)
		if err != nil {
			Logger.Errorf("Failed to import targets: %v", err)
		}
	}

	// Execute deactivations for stale projects
	if len(deactivateIDs) > 0 {
		Logger.Infof("Performing bulk deactivation for %d projects", len(deactivateIDs))
		bdRes, bdErr := BulkDeactivateProjects(ctx, orgID, deactivateIDs, false)
		if bdErr != nil {
			Logger.Errorf("bulk deactivate encountered error: %v", bdErr)
		}
		for _, sid := range bdRes.Success {
			Logger.Infof("Deactivated project: %s", sid)
		}
		for fid, ferr := range bdRes.Failed {
			Logger.Errorf("Failed to deactivate project %s: %s", fid, ferr)
		}
	}

	return nil
}

// performGitHubImports executes Snyk import API calls for each missing manifest (per-file + exclusions).
func performGitHubImports(ctx context.Context, targets []map[string]interface{}, orgID, integrationID string) error {
	results, err := ParallelImportSyncMaps(ctx, targets, orgID, integrationID, "github")
	if err != nil {
		return err
	}
	imported, failed, skipped := results.GetCounts()
	Logger.Infof("GitHub import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
	return nil
}
