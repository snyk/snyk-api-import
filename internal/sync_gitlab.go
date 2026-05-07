package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sam1el/snyk-api-import-go/internal/security"
)

// SyncGitLab performs sync for GitLab using API-first manifest discovery
func SyncGitLab(orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool) error {
	ctx := context.Background()
	return SyncGitLabContext(ctx, orgID, source, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback)
}

// SyncGitLabContext performs sync for GitLab with context support
func SyncGitLabContext(ctx context.Context, orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool) error {
	startTime := time.Now()

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

	// Get GitLab auth
	auth, err := GetGitLabAuth()
	if err != nil {
		return fmt.Errorf("get GitLab auth: %w", err)
	}
	Logger.Infof("Using GitLab authentication (Personal Access Token)")
	Logger.Infof("Using GitLab instance: %s", auth.BaseURL)

	missing := []string{}
	if snykToken == "" {
		missing = append(missing, "SNYK_TOKEN")
	}
	if orgID == "" {
		missing = append(missing, "ORG_ID")
	}
	if len(missing) > 0 {
		return fmt.Errorf("required environment variables not set: %s", strings.Join(missing, ", "))
	}

	// Initialize cache
	cacheDir := filepath.Join(snykLogPath, "cache")
	cache, err := LoadManifestCache(cacheDir, orgID)
	if err != nil {
		Logger.Warnf("Failed to load cache: %v (will create new cache)", err)
		cache = NewManifestCache(orgID)
	}
	Logger.Infof("Cache loaded from: %s", cacheDir)

	// Read targets file
	var targets struct {
		Targets []struct {
			Target struct {
				ID       int    `json:"id"`
				Name     string `json:"name"`
				FullName string `json:"full_name"`
				Owner    string `json:"owner"`
				Branch   string `json:"branch"`
			} `json:"target"`
			OrgID         string `json:"orgID"`
			IntegrationID string `json:"integrationID,omitempty"`
		} `json:"targets"`
	}

	groupSet := make(map[string]bool)

	if targetsFile != "" {
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
				// Extract unique GitLab groups from targets
				for _, t := range targets.Targets {
					if t.Target.Owner != "" && security.IsValidIdentifier(t.Target.Owner) {
						groupSet[t.Target.Owner] = true
					}
				}
				Logger.Infof("Loaded %d targets from file", len(targets.Targets))
			}
		}
	}

	// Define manifest types for project discovery
	manifestTypes := getDefaultManifestTypes()

	// Fetch Snyk projects
	snykProjectsRaw, err := FetchSnykProjects(ctx, orgID, snykToken, manifestTypes)
	if err != nil {
		return fmt.Errorf("fetch Snyk projects: %w", err)
	}
	Logger.Infof("Fetched %d Snyk projects", len(snykProjectsRaw))

	// If no targets file, extract GitLab groups from existing Snyk projects
	if len(groupSet) == 0 {
		Logger.Infof("No targets file provided, extracting GitLab groups from existing Snyk projects...")
		for _, p := range snykProjectsRaw {
			origin := p["origin"]
			name := p["name"]

			// Check if this is a GitLab project
			if origin == "gitlab" || origin == "gitlab-enterprise" {
				// Extract group from project name (format: "group/project:manifest")
				if strings.Contains(name, "/") {
					parts := strings.SplitN(name, "/", 2)
					if len(parts) > 0 {
						group := parts[0]
						if group != "" && security.IsValidIdentifier(group) {
							groupSet[group] = true
							Logger.Debugf("Extracted GitLab group from project: %s (origin: %s, name: %s)", group, origin, name)
						}
					}
				}
			}
		}
		Logger.Infof("Extracted %d GitLab group(s) from Snyk projects", len(groupSet))
		if len(groupSet) > 0 {
			groups := make([]string, 0, len(groupSet))
			for g := range groupSet {
				groups = append(groups, g)
			}
			Logger.Debugf("GitLab groups: %v", groups)
		}
	}

	// If still no groups, try to list from GitLab API
	if len(groupSet) == 0 {
		Logger.Infof("No groups found, attempting to list from GitLab API...")
		groups, err := ListGitLabGroups(ctx, auth)
		if err != nil {
			return fmt.Errorf("list GitLab groups: %w", err)
		}

		for _, group := range groups {
			if group.FullPath != "" && security.IsValidIdentifier(group.FullPath) {
				groupSet[group.FullPath] = true
			}
		}
		Logger.Infof("Listed %d groups from GitLab API", len(groupSet))
	}

	if len(groupSet) == 0 {
		return fmt.Errorf("no GitLab groups to process (no targets file and no existing projects found)")
	}

	// Get product filter from environment
	productFilter := os.Getenv("SNYK_PRODUCT")
	if productFilter != "" {
		Logger.Infof("Product filter enabled: %s", productFilter)
	}

	// Filter out inactive projects first
	activeProjects := make([]map[string]interface{}, 0)
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
		activeProjects = append(activeProjects, m)
	}

	// Apply product filter if specified using shared function
	filteredProjects := FilterSnykProjectsByProduct(activeProjects, productFilter)

	// Convert back to []map[string]string for compatibility
	filteredSnykProjects := make([]map[string]string, 0, len(filteredProjects))
	for _, p := range filteredProjects {
		m := make(map[string]string)
		for k, v := range p {
			if str, ok := v.(string); ok {
				m[k] = str
			}
		}
		filteredSnykProjects = append(filteredSnykProjects, m)
	}

	if productFilter != "" {
		Logger.Infof("Filtered to %d active Snyk projects matching product: %s", len(filteredSnykProjects), productFilter)
	} else {
		Logger.Infof("Filtered to %d active Snyk projects (all product types)", len(filteredSnykProjects))
	}

	// Discover manifests using API-first approach with caching
	Logger.Infof("Starting optimized manifest discovery for %d GitLab groups...", len(groupSet))
	discoveryStart := time.Now()

	gitlabRepos := make([]map[string]interface{}, 0)
	cacheHits := 0
	cacheMisses := 0
	totalAPICalls := 0

	// Create GitLab client for discovery
	gitlabClient, err := NewGitLabClient(auth)
	if err != nil {
		return fmt.Errorf("create GitLab client: %w", err)
	}

	for group := range groupSet {
		// List projects in the group
		repos, err := ListGitLabRepos(ctx, auth, group)
		if err != nil {
			Logger.Warnf("Failed to list repos for group %s: %v", group, err)
			continue
		}

		for _, repo := range repos {
			branch := repo.DefaultBranch
			if branch == "" {
				branch = "main"
			}

			// Extract repo name from PathWithNamespace (e.g., "jb-testing1/ecom_demo" -> "ecom_demo")
			repoName := repo.PathWithNamespace
			if idx := strings.LastIndex(repoName, "/"); idx >= 0 {
				repoName = repoName[idx+1:]
			}

			// Check cache first
			cached, found := cache.Get(group, repoName, branch)
			if found {
				cacheHits++
				Logger.Debugf("Cache HIT for %s@%s", repo.PathWithNamespace, branch)

				// Filter files by product type if specified
				var files []string
				if productFilter != "" {
					files = cached.GetFilesByType(productFilter)
				} else {
					files = cached.GetAllFiles()
				}

				// Filter out lock files that aren't primary import targets
				var importableFiles []string
				for _, f := range files {
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

				if len(importableFiles) > 0 {
					// Add each file as a separate entry (matching GitHub optimized sync pattern)
					for _, manifest := range importableFiles {
						gitlabRepos = append(gitlabRepos, map[string]interface{}{
							"id":         repo.ID,
							"name":       repoName,
							"full_name":  repo.PathWithNamespace,
							"owner":      group,
							"branch":     branch,
							"manifest":   manifest,
							"commit_sha": cached.CommitSHA,
							"from_cache": true,
						})
					}
				}
				// If no importable files, skip this repo (don't add empty manifest entry)
			} else {
				cacheMisses++
				Logger.Debugf("Cache MISS for %s@%s - discovering via API", repo.PathWithNamespace, branch)

				// Discover via GitLab Tree API
				result, err := DiscoverFilesViaGitLabTree(ctx, gitlabClient, repo.ID, repo.PathWithNamespace, branch)
				if err != nil {
					Logger.Warnf("Failed to discover files for %s: %v", repo.PathWithNamespace, err)
					continue
				}

				totalAPICalls += result.APICalls

				// Save to cache
				cache.SetEntry(group, repoName, branch, CachedRepoEntry{
					CommitSHA:      result.CommitSHA,
					SCAFiles:       result.SCAFiles,
					IaCFiles:       result.IaCFiles,
					ContainerFiles: result.ContainerFiles,
					LastChecked:    time.Now(),
				})

				// Filter files by product type if specified
				var files []string
				if productFilter != "" {
					switch strings.ToLower(productFilter) {
					case "opensource", "sca":
						files = result.SCAFiles
					case "iac":
						files = result.IaCFiles
					case "container":
						files = result.ContainerFiles
					}
				} else {
					files = append(files, result.SCAFiles...)
					files = append(files, result.IaCFiles...)
					files = append(files, result.ContainerFiles...)
				}

				// Filter out lock files that aren't primary import targets
				var importableFiles []string
				for _, f := range files {
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

				if len(importableFiles) > 0 {
					// Add each file as a separate entry (matching GitHub optimized sync pattern)
					for _, manifest := range importableFiles {
						gitlabRepos = append(gitlabRepos, map[string]interface{}{
							"id":         repo.ID,
							"name":       repoName,
							"full_name":  repo.PathWithNamespace,
							"owner":      group,
							"branch":     branch,
							"manifest":   manifest,
							"commit_sha": result.CommitSHA,
							"from_cache": false,
						})
					}
				}
				// If no importable files, skip this repo (don't add empty manifest entry)
			}
		}
	}

	discoveryDuration := time.Since(discoveryStart)
	Logger.Infof("Discovery complete in %v", discoveryDuration)
	Logger.Infof("Cache performance: %d hits, %d misses (%.1f%% hit rate)",
		cacheHits, cacheMisses, float64(cacheHits)/float64(cacheHits+cacheMisses)*100)
	Logger.Infof("Total API calls: %d", totalAPICalls)

	// Save cache
	if err := cache.Save(cacheDir); err != nil {
		Logger.Warnf("Failed to save cache: %v", err)
	}

	Logger.Infof("Discovered %d GitLab repositories with manifests", len(gitlabRepos))

	// Convert snykProjects to []map[string]interface{} for CompareStates
	snykProjectsInterface := make([]map[string]interface{}, len(filteredSnykProjects))
	for i, p := range filteredSnykProjects {
		snykProjectsInterface[i] = make(map[string]interface{})
		for k, v := range p {
			snykProjectsInterface[i][k] = v
		}
	}

	// Compare with Snyk projects
	comparison := CompareStates(snykProjectsInterface, gitlabRepos, manifestTypes)

	Logger.Infof("\n=== Sync Comparison Results ===")
	Logger.Infof("Missing files to import: %d", len(comparison.Missing))
	Logger.Infof("Stale projects (to deactivate): %d", len(comparison.Stale))
	if len(comparison.ImportableEmpty) > 0 {
		Logger.Infof("Repos with no manifests (will be skipped): %d", len(comparison.ImportableEmpty))
	}

	// Handle dry-run mode
	if dryRun {
		PrintDryRunSummary(comparison, discoveryDuration, time.Since(startTime), "gitlab", nil)
		return nil
	}

	// Perform actual imports
	if len(comparison.Missing) > 0 {
		Logger.Infof("Importing %d new targets...", len(comparison.Missing))
		if err := performGitLabImportsOptimized(ctx, comparison.Missing, orgID, snykToken, auth.BaseURL); err != nil {
			return fmt.Errorf("perform imports: %w", err)
		}
	}

	// Deactivate stale projects
	if len(comparison.Stale) > 0 {
		Logger.Infof("Deactivating %d stale projects...", len(comparison.Stale))
		for _, stale := range comparison.Stale {
			projectID, _ := stale["id"].(string)
			name, _ := stale["name"].(string)
			if projectID == "" {
				Logger.Warnf("Skipping stale project with no ID: %s", name)
				continue
			}
			if err := DeactivateProject(ctx, orgID, projectID); err != nil {
				Logger.Warnf("Failed to deactivate project %s: %v", projectID, err)
			} else {
				Logger.Infof("Deactivated project: %s", name)
			}
		}
	}

	// Handle branch updates using PATCH API with fallback
	// Wrap performGitLabImportsOptimized to match PerformImportsFunc signature
	gitlabImportWrapper := func(ctx context.Context, targets []map[string]interface{}, orgID, integrationID string) error {
		return performGitLabImportsOptimized(ctx, targets, orgID, snykToken, auth.BaseURL)
	}
	if err := HandleBranchUpdates(ctx, orgID, comparison.BranchUpdates, "gitlab", gitlabImportWrapper, enableBranchUpdateFallback); err != nil {
		Logger.Errorf("Branch update handler error: %v", err)
	}

	totalDuration := time.Since(startTime)
	Logger.Infof("\n=== Performance Summary ===")
	Logger.Infof("Total execution time: %v", totalDuration)
	Logger.Infof("Discovery time: %v (%.1f%%)", discoveryDuration, float64(discoveryDuration)/float64(totalDuration)*100)
	Logger.Infof("Cache hit rate: %.1f%%", float64(cacheHits)/float64(cacheHits+cacheMisses)*100)
	Logger.Infof("API calls saved by cache: %d", cacheHits*2) // Approximate: each cache hit saves ~2 API calls

	return nil
}

// performGitLabImportsOptimized performs the actual import of GitLab repositories into Snyk
func performGitLabImportsOptimized(ctx context.Context, targets []map[string]interface{}, orgID, snykToken, gitlabURL string) error {
	// Get integration ID for GitLab using shared ListIntegrations function
	integrations, err := ListIntegrations(ctx, orgID)
	if err != nil {
		return fmt.Errorf("list integrations: %w", err)
	}

	// Determine integration key based on GitLab URL
	integrationKey := "gitlab"
	if !strings.Contains(gitlabURL, "gitlab.com") {
		integrationKey = "gitlab-enterprise"
	}

	integrationID, ok := integrations[integrationKey]
	if !ok {
		return fmt.Errorf("no %s integration found for org %s (available: %v)", integrationKey, orgID, integrations)
	}

	Logger.Infof("Using GitLab integration ID: %s", integrationID)

	// Convert map targets to ImportTarget structs for ParallelImport
	importTargets := make([]ImportTarget, 0, len(targets))
	for _, t := range targets {
		name, _ := t["name"].(string)
		owner, _ := t["owner"].(string)
		branch, _ := t["branch"].(string)
		// Note: manifest field is not used in parallel import (Snyk auto-detects)

		importTargets = append(importTargets, ImportTarget{
			Target: Target{
				Name:   name,
				Owner:  owner,
				Branch: branch,
			},
			OrgID:         orgID,
			IntegrationID: integrationID,
		})
	}

	// Use parallel import
	config := ParallelImportConfig{
		OrgID:         orgID,
		IntegrationID: integrationID,
		Source:        "gitlab",
		Concurrency:   GetImportConcurrency(0),
		SnykToken:     snykToken,
		PollTimeout:   GetPollTimeout(),
		DryRun:        false,
	}

	Logger.Infof("Starting parallel GitLab imports: %d targets, concurrency=%d", len(importTargets), config.Concurrency)

	results, err := ParallelImport(ctx, importTargets, config)
	if err != nil {
		return fmt.Errorf("parallel import: %w", err)
	}

	// Log summary
	imported, failed, skipped := results.GetCounts()
	Logger.Infof("GitLab import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)

	return nil
}
