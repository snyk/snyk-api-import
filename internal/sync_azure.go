package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/snyk/snyk-api-import/internal/security"
)

// SyncAzure performs sync for Azure DevOps using API-first manifest discovery
func SyncAzure(orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool) error {
	ctx := context.Background()
	return SyncAzureContext(ctx, orgID, source, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback)
}

// SyncAzureContext performs sync for Azure DevOps with context support
func SyncAzureContext(ctx context.Context, orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool) error {
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

	// Get Azure auth
	auth, err := GetAzureAuth()
	if err != nil {
		return fmt.Errorf("get Azure auth: %w", err)
	}
	Logger.Infof("Using Azure DevOps authentication (Personal Access Token)")
	Logger.Infof("Using Azure DevOps instance: %s", auth.BaseURL)

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
				Name         string `json:"name"`
				FullName     string `json:"full_name"`
				Owner        string `json:"owner"`
				Organization string `json:"organization"`
				Project      string `json:"project"`
				Branch       string `json:"branch"`
			} `json:"target"`
			OrgID         string `json:"orgID"`
			IntegrationID string `json:"integrationID,omitempty"`
		} `json:"targets"`
	}

	orgProjectSet := make(map[string]map[string]bool) // org -> set of projects

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
				// Extract unique Azure org/project combinations from targets
				// Azure targets use "owner" field for the project name
				// We need to get the org from AZURE_TEST_ORG or default_org
				azureOrgName := os.Getenv("AZURE_TEST_ORG")
				if azureOrgName == "" {
					// Try to get from config default_org
					tomlConfig := GetGlobalTOMLConfig()
					if tomlConfig != nil {
						if azureInteg, ok := tomlConfig.Integrations["azure-repos"]; ok {
							azureOrgName = azureInteg.DefaultOrg
						}
					}
				}

				for _, t := range targets.Targets {
					// For Azure, the "owner" field contains the project name
					proj := t.Target.Owner
					if proj == "" {
						proj = t.Target.Project
					}

					org := azureOrgName
					if org == "" {
						org = t.Target.Organization
					}

					if org != "" && proj != "" && security.IsValidIdentifier(org) && security.IsValidIdentifier(proj) {
						if orgProjectSet[org] == nil {
							orgProjectSet[org] = make(map[string]bool)
						}
						orgProjectSet[org][proj] = true
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

	// If no targets file, extract Azure orgs/projects from existing Snyk projects
	if len(orgProjectSet) == 0 {
		Logger.Infof("No targets file provided, extracting Azure orgs/projects from existing Snyk projects...")
		for _, p := range snykProjectsRaw {
			origin := p["origin"]
			name := p["name"]

			// Check if this is an Azure project
			if origin == "azure-repos" {
				// Extract org/project from project name
				// Supports two formats:
				// 1. "org/project/repo:manifest" (3+ parts) - full format
				// 2. "project/repo:manifest" (2 parts) - when org name matches project name
				parts := strings.Split(name, "/")
				var org, proj string

				if len(parts) >= 3 {
					// Full format: org/project/repo:manifest
					org = parts[0]
					proj = parts[1]
				} else if len(parts) == 2 {
					// Short format: project/repo:manifest (org == project)
					// Extract project name (first part before colon)
					proj = parts[0]
					org = proj // Assume org name matches project name
				}

				if org != "" && proj != "" && security.IsValidIdentifier(org) && security.IsValidIdentifier(proj) {
					if orgProjectSet[org] == nil {
						orgProjectSet[org] = make(map[string]bool)
					}
					orgProjectSet[org][proj] = true
					Logger.Debugf("Extracted Azure org/project from Snyk project: %s/%s (origin: %s, name: %s)", org, proj, origin, name)
				}
			}
		}
		totalProjects := 0
		for _, projects := range orgProjectSet {
			totalProjects += len(projects)
		}
		Logger.Infof("Extracted %d Azure org(s) with %d project(s) from Snyk projects", len(orgProjectSet), totalProjects)
		if len(orgProjectSet) > 0 {
			for org, projects := range orgProjectSet {
				Logger.Debugf("Azure org %s: %d projects", org, len(projects))
			}
		}
	}

	if len(orgProjectSet) == 0 {
		return fmt.Errorf("no Azure orgs/projects to process (no targets file and no existing projects found)")
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
	totalOrgs := len(orgProjectSet)
	totalProjects := 0
	for _, projects := range orgProjectSet {
		totalProjects += len(projects)
	}
	Logger.Infof("Starting optimized manifest discovery for %d Azure org(s) with %d project(s)...", totalOrgs, totalProjects)
	discoveryStart := time.Now()

	azureRepos := make([]map[string]interface{}, 0)
	cacheHits := 0
	cacheMisses := 0
	totalAPICalls := 0

	for azureOrg, projectNames := range orgProjectSet {
		// First, list all projects in the organization to get their IDs
		allProjects, err := ListAzureProjects(ctx, auth, azureOrg)
		if err != nil {
			Logger.Warnf("Failed to list projects for org %s: %v", azureOrg, err)
			continue
		}

		// Filter to only the projects we care about
		var projectsToScan []AzureProject
		for _, proj := range allProjects {
			if projectNames[proj.Name] {
				projectsToScan = append(projectsToScan, proj)
			}
		}

		for _, azureProject := range projectsToScan {
			// List repos in the project
			repos, err := ListAzureRepos(ctx, auth, azureOrg, azureProject)
			if err != nil {
				Logger.Warnf("Failed to list repos for %s/%s: %v", azureOrg, azureProject.Name, err)
				continue
			}

			Logger.Infof("Project %s: ListAzureRepos returned %d repos", azureProject.Name, len(repos))

			for _, repo := range repos {
				// repos is []map[string]string, so access as map
				isDisabled := repo["is_disabled"]
				if isDisabled == "true" {
					Logger.Debugf("Skipping disabled repo: %s/%s/%s", azureOrg, azureProject.Name, repo["name"])
					continue
				}

				branch := repo["branch"]
				if branch == "" {
					// Skip repos without a default branch (likely empty repos)
					// This matches the behavior of non-optimized sync
					Logger.Debugf("Skipping repo without default branch: %s/%s/%s", azureOrg, azureProject.Name, repo["name"])
					continue
				}
				// Azure default branches come with "refs/heads/" prefix, strip it and trim whitespace
				branch = strings.TrimSpace(strings.TrimPrefix(branch, "refs/heads/"))

				repoName := repo["name"]
				repoID := repo["id"]
				if repoID == "" {
					repoID = repoName // Fallback to name if ID not available
				}

				Logger.Debugf("Processing repo: name=%s, id=%s, branch=%s", repoName, repoID, branch)

				// Check cache first
				cached, found := cache.Get(azureOrg+"/"+azureProject.Name, repoName, branch)
				if found {
					cacheHits++
					Logger.Debugf("Cache HIT for %s/%s/%s@%s", azureOrg, azureProject.Name, repoName, branch)

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
						// Add each file as a separate entry
						for _, manifest := range importableFiles {
							azureRepos = append(azureRepos, map[string]interface{}{
								"name":         repoName,
								"organization": azureOrg,
								"project":      azureProject.Name,
								"owner":        azureProject.Name, // Use project name to match Snyk's format (project/repo)
								"branch":       branch,
								"manifest":     manifest,
								"commit_sha":   cached.CommitSHA,
								"from_cache":   true,
							})
						}
					}
					// If no importable files, skip this repo (don't add empty manifest entry)
				} else {
					cacheMisses++
					Logger.Debugf("Cache MISS for %s/%s/%s@%s - discovering via API", azureOrg, azureProject.Name, repoName, branch)

					// Discover via Azure Items API using repository name (matching git clone behavior)
					// Azure Items API accepts either repository ID (GUID) or repository name
					result, err := DiscoverFilesViaAzureTree(ctx, auth, azureOrg, azureProject.Name, repoName, branch)
					if err != nil {
						Logger.Warnf("Failed to discover files for %s/%s/%s: %v", azureOrg, azureProject.Name, repoName, err)
						continue
					}

					totalAPICalls += result.APICalls

					// Save to cache
					cache.SetEntry(azureOrg+"/"+azureProject.Name, repoName, branch, CachedRepoEntry{
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
						// Add each file as a separate entry
						for _, manifest := range importableFiles {
							azureRepos = append(azureRepos, map[string]interface{}{
								"name":         repoName,
								"organization": azureOrg,
								"project":      azureProject.Name,
								"owner":        azureProject.Name, // Use project name to match Snyk's format (project/repo)
								"branch":       branch,
								"manifest":     manifest,
								"commit_sha":   result.CommitSHA,
								"from_cache":   false,
							})
						}
					}
					// If no importable files, skip this repo (don't add empty manifest entry)
				}
			}
		}
	}

	discoveryDuration := time.Since(discoveryStart)
	Logger.Infof("Discovery complete in %v", discoveryDuration)
	if cacheHits+cacheMisses > 0 {
		Logger.Infof("Cache performance: %d hits, %d misses (%.1f%% hit rate)",
			cacheHits, cacheMisses, float64(cacheHits)/float64(cacheHits+cacheMisses)*100)
	}
	Logger.Infof("Total API calls: %d", totalAPICalls)

	// Save cache
	if err := cache.Save(cacheDir); err != nil {
		Logger.Warnf("Failed to save cache: %v", err)
	}

	Logger.Infof("Discovered %d Azure repositories with manifests", len(azureRepos))

	// Convert snykProjects to []map[string]interface{} for CompareStates
	snykProjectsInterface := make([]map[string]interface{}, len(filteredSnykProjects))
	for i, p := range filteredSnykProjects {
		snykProjectsInterface[i] = make(map[string]interface{})
		for k, v := range p {
			snykProjectsInterface[i][k] = v
		}
	}

	// Compare with Snyk projects
	comparison := CompareStates(snykProjectsInterface, azureRepos, manifestTypes)

	Logger.Infof("\n=== Sync Comparison Results ===")
	Logger.Infof("Missing files to import: %d", len(comparison.Missing))
	Logger.Infof("Stale projects (to deactivate): %d", len(comparison.Stale))
	if len(comparison.ImportableEmpty) > 0 {
		Logger.Infof("Repos with no manifests (will be skipped): %d", len(comparison.ImportableEmpty))
	}

	// Handle dry-run mode
	if dryRun {
		PrintDryRunSummary(comparison, discoveryDuration, time.Since(startTime), "azure-repos", nil)
		return nil
	}

	// Perform actual imports
	if len(comparison.Missing) > 0 {
		Logger.Infof("Importing %d new targets...", len(comparison.Missing))
		if err := performAzureImportsOptimized(ctx, comparison.Missing, orgID, snykToken); err != nil {
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
	// Wrap performAzureImportsOptimized to match PerformImportsFunc signature
	azureImportWrapper := func(ctx context.Context, targets []map[string]interface{}, orgID, integrationID string) error {
		return performAzureImportsOptimized(ctx, targets, orgID, snykToken)
	}
	if err := HandleBranchUpdates(ctx, orgID, comparison.BranchUpdates, "azure-repos", azureImportWrapper, enableBranchUpdateFallback); err != nil {
		Logger.Errorf("Branch update handler error: %v", err)
	}

	totalDuration := time.Since(startTime)
	Logger.Infof("\n=== Performance Summary ===")
	Logger.Infof("Total execution time: %v", totalDuration)
	Logger.Infof("Discovery time: %v (%.1f%%)", discoveryDuration, float64(discoveryDuration)/float64(totalDuration)*100)
	if cacheHits+cacheMisses > 0 {
		Logger.Infof("Cache hit rate: %.1f%%", float64(cacheHits)/float64(cacheHits+cacheMisses)*100)
		Logger.Infof("API calls saved by cache: %d", cacheHits*1) // Each cache hit saves ~1 API call for Azure
	}

	return nil
}

// performAzureImportsOptimized imports each missing manifest into Snyk (per-file + exclusions).
func performAzureImportsOptimized(ctx context.Context, targets []map[string]interface{}, orgID, snykToken string) error {
	_ = snykToken
	integrations, err := ListIntegrations(ctx, orgID)
	if err != nil {
		return fmt.Errorf("list integrations: %w", err)
	}

	integrationKey := "azure-repos"
	integrationID, ok := integrations[integrationKey]
	if !ok {
		return fmt.Errorf("no %s integration found for org %s (available: %v)", integrationKey, orgID, integrations)
	}

	Logger.Infof("Using Azure DevOps integration ID: %s", integrationID)

	results, err := ParallelImportSyncMaps(ctx, targets, orgID, integrationID, integrationKey)
	if err != nil {
		return err
	}
	imported, failed, skipped := results.GetCounts()
	Logger.Infof("Azure DevOps import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
	return nil
}
