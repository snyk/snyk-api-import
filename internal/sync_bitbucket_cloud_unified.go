package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SyncBitbucketCloudUnified performs sync for both Bitbucket Cloud (Basic Auth) and
// Bitbucket Cloud App (OAuth) using API-first manifest discovery.
// The source parameter determines which authentication method to use:
// - "bitbucket-cloud": Basic Auth (BITBUCKET_CLOUD_USERNAME + BITBUCKET_CLOUD_PASSWORD)
// - "bitbucket-cloud-app": OAuth 2.0 (BITBUCKET_APP_CLIENT_ID + BITBUCKET_APP_CLIENT_SECRET)
func SyncBitbucketCloudUnified(ctx context.Context, source, orgID, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool, useCache bool) error {
	Logger.Infof("Using API-first sync for Bitbucket (source: %s)", source)

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

	// Determine authentication method and integration key based on source
	var auth *BitbucketCloudAuth
	var integrationKey string
	var err error

	switch source {
	case "bitbucket-cloud-app":
		// OAuth 2.0 flow for Bitbucket Cloud App
		clientID := os.Getenv("BITBUCKET_APP_CLIENT_ID")
		clientSecret := os.Getenv("BITBUCKET_APP_CLIENT_SECRET")

		missing := []string{}
		if snykToken == "" {
			missing = append(missing, "SNYK_TOKEN")
		}
		if orgID == "" {
			missing = append(missing, "ORG_ID")
		}
		if clientID == "" {
			missing = append(missing, "BITBUCKET_APP_CLIENT_ID")
		}
		if clientSecret == "" {
			missing = append(missing, "BITBUCKET_APP_CLIENT_SECRET")
		}
		if len(missing) > 0 {
			return fmt.Errorf("bitbucket-cloud-app source requires environment variables: %s", strings.Join(missing, ", "))
		}

		// Fetch OAuth token
		token, err := FetchBitbucketAppToken(ctx, clientID, clientSecret)
		if err != nil {
			return fmt.Errorf("fetch bitbucket app token: %w", err)
		}

		auth = &BitbucketCloudAuth{
			Method: "token",
			Token:  token,
		}
		integrationKey = "bitbucket-connect-app"
		Logger.Infof("Using Bitbucket Cloud App authentication (OAuth 2.0)")

	case "bitbucket-cloud":
		// Basic Auth flow for Bitbucket Cloud
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

		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return fmt.Errorf("bitbucket-cloud source requires BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD: %w", err)
		}
		integrationKey = "bitbucket-cloud"
		Logger.Infof("Using Bitbucket Cloud authentication (Basic Auth with API token)")

	default:
		return fmt.Errorf("unsupported Bitbucket source type: %s (expected 'bitbucket-cloud' or 'bitbucket-cloud-app')", source)
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

	// Define manifest types for project discovery
	manifestTypes := getDefaultManifestTypes()
	snykProjectsRaw, err := FetchSnykProjects(ctx, orgID, snykToken, manifestTypes)
	if err != nil {
		return fmt.Errorf("fetch snyk projects: %w", err)
	}

	// Initialize cache
	cacheDir := filepath.Join(snykLogPath, "cache")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		Logger.Warnf("Failed to create cache directory: %v, proceeding without cache", err)
		useCache = false
	}

	cache, err := LoadManifestCache(cacheDir, orgID)
	if err != nil {
		Logger.Warnf("Failed to load cache: %v, will rebuild", err)
		cache = NewManifestCache(orgID)
	}

	// Determine workspaces to scan
	var workspaces []string
	workspaceSet := make(map[string]bool)

	// For bitbucket-cloud-app, check BITBUCKET_WORKSPACE env var first
	if source == "bitbucket-cloud-app" {
		workspace := os.Getenv("BITBUCKET_WORKSPACE")
		if workspace != "" {
			workspaces = []string{workspace}
			Logger.Infof("Using workspace from BITBUCKET_WORKSPACE: %s", workspace)
		}
	}

	// If no explicit workspace, extract from targets file
	if len(workspaces) == 0 {
		for _, t := range targets.Targets {
			workspaceSet[t.Target.Owner] = true
		}

		// If no targets found, extract Bitbucket workspaces from existing Snyk projects
		if len(workspaceSet) == 0 {
			Logger.Info("No targets file found, extracting Bitbucket workspaces from existing Snyk projects")
			for _, p := range snykProjectsRaw {
				name := p["name"]
				if name != "" {
					// Parse workspace from name (format: "workspace/repo:manifest")
					parts := strings.Split(name, "/")
					if len(parts) >= 2 {
						ws := parts[0]
						workspaceSet[ws] = true
						Logger.Debugf("Extracted Bitbucket workspace: %s from project: %s", ws, name)
					}
				}
			}
		}

		// If still no workspaces and using bitbucket-cloud-app, fetch all accessible workspaces
		if len(workspaceSet) == 0 && source == "bitbucket-cloud-app" {
			Logger.Info("No workspaces found in Snyk projects, fetching all accessible workspaces")
			ws, err := ListBitbucketAppWorkspaces(ctx, auth.Token)
			if err != nil {
				return fmt.Errorf("list bitbucket app workspaces: %w", err)
			}
			// Convert BitbucketWorkspace to string slice
			for _, w := range ws {
				workspaceSet[w.Slug] = true
			}
			Logger.Infof("Discovered %d workspace(s) from Bitbucket App", len(workspaceSet))
		}

		// Convert set to slice
		for ws := range workspaceSet {
			workspaces = append(workspaces, ws)
		}

		if len(workspaces) > 0 {
			Logger.Infof("Extracted %d Bitbucket workspace(s)", len(workspaces))
			for _, ws := range workspaces {
				Logger.Infof("  - %s", ws)
			}
		}
	}

	// Fetch Bitbucket repos from all workspaces
	bitbucketRepos := []map[string]interface{}{}
	startTime := time.Now()
	totalAPIcalls := 0

	for _, ws := range workspaces {
		// Validate workspace name to prevent SSRF
		if !isValidWorkspaceName(ws) {
			Logger.Warnf("Skipping invalid workspace name: %s", ws)
			continue
		}

		Logger.Infof("Discovering manifests for workspace: %s", ws)

		// Use the cache-aware fetch function
		repos, apiCalls, err := FetchBitbucketCloudReposWithCache(ctx, auth, ws, manifestTypes, cache)
		if err != nil {
			Logger.Warnf("Failed to fetch repos for workspace %s: %v", ws, err)
			continue
		}

		// repos already have manifest, branch, name, owner populated
		for _, r := range repos {
			// Convert map[string]string to map[string]interface{} for CompareStates
			entry := make(map[string]interface{})
			for k, v := range r {
				entry[k] = v
			}
			bitbucketRepos = append(bitbucketRepos, entry)
		}

		totalAPIcalls += apiCalls
	}

	discoveryTime := time.Since(startTime)

	// Save cache
	if useCache {
		if err := cache.Save(cacheDir); err != nil {
			Logger.Warnf("Failed to save cache: %v", err)
		}
	}

	// Log performance metrics
	Logger.Infof("Discovery completed in %v", discoveryTime)
	Logger.Infof("Performance metrics:")
	Logger.Infof("  - Total manifests found: %d", len(bitbucketRepos))
	Logger.Infof("  - Total API calls: %d", totalAPIcalls)
	if len(workspaces) > 0 {
		Logger.Infof("  - Avg API calls per workspace: %.1f", float64(totalAPIcalls)/float64(len(workspaces)))
	}

	// Filter discovered files by product type if specified
	productType := os.Getenv("SNYK_PRODUCT")
	if productType != "" {
		Logger.Infof("Filtering discovered files by product type: %s", productType)
		filteredRepos := make([]map[string]interface{}, 0)

		for _, repo := range bitbucketRepos {
			manifest, _ := repo["manifest"].(string)
			include := false

			switch productType {
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
			len(bitbucketRepos), len(filteredRepos), productType)
		bitbucketRepos = filteredRepos
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
	filteredProjects := FilterSnykProjectsByProduct(activeProjects, productType)

	// Convert back to []map[string]string for compatibility
	filtered := make([]map[string]string, 0, len(filteredProjects))
	for _, p := range filteredProjects {
		m := make(map[string]string)
		for k, v := range p {
			if str, ok := v.(string); ok {
				m[k] = str
			}
		}
		filtered = append(filtered, m)
	}

	if productType != "" {
		Logger.Infof("Filtered to %d active Snyk projects matching product type %s (from %d total)", len(filtered), productType, len(snykProjectsRaw))
	} else {
		Logger.Infof("Filtered to %d active Snyk projects (all product types, from %d total)", len(filtered), len(snykProjectsRaw))
	}
	snykProjectsRaw = filtered

	// Convert snykProjectsRaw to []map[string]interface{} for CompareStates
	snykProjects := make([]map[string]interface{}, len(snykProjectsRaw))
	for i, p := range snykProjectsRaw {
		m := make(map[string]interface{})
		for k, v := range p {
			m[k] = v
		}
		snykProjects[i] = m
	}

	// Compare states
	result := CompareStates(snykProjects, bitbucketRepos, manifestTypes)

	Logger.Infof("Comparing %d Snyk projects (all product types) with discovered files", len(snykProjects))
	Logger.Infof("Sync comparison results:")
	Logger.Infof("- Missing files to import: %d", len(result.Missing))
	Logger.Infof("- Stale projects to deactivate: %d", len(result.Stale))
	if len(result.ImportableEmpty) > 0 {
		Logger.Infof("- Repos with no manifests: %d (will be skipped)", len(result.ImportableEmpty))
	}
	Logger.Infof("- Branch updates needed: %d", len(result.BranchUpdates))

	// Dry-run mode: just show what would be done
	if dryRun {
		additionalMetrics := map[string]interface{}{
			"api_calls": totalAPIcalls,
		}
		if len(workspaces) > 0 {
			additionalMetrics["avg_calls_per_workspace"] = float64(totalAPIcalls) / float64(len(workspaces))
		}
		PrintDryRunSummary(result, discoveryTime, time.Since(startTime), source, additionalMetrics)
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

	// Select the appropriate import function based on source
	var performImports PerformImportsFunc
	if source == "bitbucket-cloud-app" {
		performImports = performBitbucketCloudAppImports
	} else {
		performImports = performBitbucketCloudImports
	}

	// Execute branch updates via PATCH (update target_reference) with fallback
	if err := HandleBranchUpdates(ctx, orgID, result.BranchUpdates, integrationKey, performImports, enableBranchUpdateFallback); err != nil {
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

		err = performImports(ctx, result.Missing, orgID, integrationID)
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
