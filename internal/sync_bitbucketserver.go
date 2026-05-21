package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SyncBitbucketServer syncs organizations and projects with Bitbucket Server (Data Center).
func SyncBitbucketServer(orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool) error {
	ctx := context.Background()
	return SyncBitbucketServerContext(ctx, orgID, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback)
}

// SyncBitbucketServerContext syncs organizations and projects with Bitbucket Server with context support.
func SyncBitbucketServerContext(ctx context.Context, orgID, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool) error {
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

	// Get Bitbucket Server auth
	auth := GetBitbucketServerAuth()
	Logger.Infof("Using Bitbucket Server instance: %s", auth.BaseURL)

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

	// Read targets file
	var targets struct {
		Targets []struct {
			Target struct {
				ProjectKey string `json:"projectKey"`
				RepoSlug   string `json:"repoSlug"`
				Branch     string `json:"branch"`
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
	manifestProjectTypes := deriveManifestProjectTypes(manifestTypes)
	snykProjectsRaw, err := FetchSnykProjects(ctx, orgID, snykToken, manifestTypes)
	if err != nil {
		return fmt.Errorf("fetch snyk projects: %w", err)
	}

	// Fetch Bitbucket Server repos from targets file and get project details
	// We need to fetch project details to get the project NAME (not just KEY)
	// because Snyk uses the slugified project NAME in project names
	bitbucketRepos := []map[string]interface{}{}

	// First, fetch all projects to build a KEY -> NAME mapping
	projects, err := FetchBitbucketServerProjects(ctx, auth)
	if err != nil {
		return fmt.Errorf("fetch bitbucket server projects: %w", err)
	}

	projectKeyToName := make(map[string]string)
	for _, proj := range projects {
		projectKeyToName[proj.Key] = proj.Name
	}

	// Bitbucket Server sync requires a targets file because:
	// 1. Fetching default branch for each repo requires separate API calls (expensive)
	// 2. Projects can have many repos and branches, making full discovery impractical
	if len(targets.Targets) == 0 {
		return fmt.Errorf("bitbucket Server sync requires a targets file; run 'import:data' first to generate targets")
	}

	for _, t := range targets.Targets {
		projectKey := t.Target.ProjectKey
		repoSlug := t.Target.RepoSlug
		branch := t.Target.Branch

		// Verify the repo still exists in Bitbucket Server
		repos, err := FetchBitbucketServerRepos(ctx, auth, projectKey)
		if err != nil {
			Logger.Warnf("Failed to fetch repos for project %s: %v", projectKey, err)
			continue
		}

		// Check if this specific repo still exists
		found := false
		for _, repo := range repos {
			if repo.RepoSlug == repoSlug && repo.ProjectKey == projectKey {
				found = true
				break
			}
		}

		if !found {
			Logger.Debugf("Repo %s/%s no longer exists in Bitbucket Server, skipping", projectKey, repoSlug)
			continue
		}

		// Get the project NAME (which Snyk uses, slugified) instead of the KEY
		projectName := projectKeyToName[projectKey]
		if projectName == "" {
			Logger.Warnf("Could not find project name for key %s, using key as fallback", projectKey)
			projectName = projectKey
		}

		// Slugify the project name to match what Snyk does
		// Snyk converts "SNYK API Testing" -> "snyk-api-testing"
		slugifiedName := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(projectName), " ", "-"))

		// Discover manifest files for this repo
		// Bitbucket Server doesn't have a file search API, so we check for files at standard locations
		discoveredManifests := DiscoverBitbucketServerManifests(ctx, auth, projectKey, repoSlug, branch, manifestTypes)

		if len(discoveredManifests) == 0 {
			// No manifests found - add repo without manifest so it can match generic Snyk projects
			entry := map[string]interface{}{
				"name":       repoSlug,
				"owner":      slugifiedName,
				"branch":     branch,
				"projectKey": projectKey,
				"repoSlug":   repoSlug,
			}
			bitbucketRepos = append(bitbucketRepos, entry)
		} else {
			// Add one entry per discovered manifest
			for _, manifest := range discoveredManifests {
				entry := map[string]interface{}{
					"name":       repoSlug,
					"owner":      slugifiedName,
					"branch":     branch,
					"manifest":   manifest,
					"projectKey": projectKey,
					"repoSlug":   repoSlug,
				}
				bitbucketRepos = append(bitbucketRepos, entry)
			}
		}
	}

	// Convert snykProjectsRaw to []map[string]interface{} for CompareStates
	snykProjects := make([]map[string]interface{}, len(snykProjectsRaw))
	for i, p := range snykProjectsRaw {
		m := make(map[string]interface{})
		for k, v := range p {
			m[k] = v
		}
		snykProjects[i] = m
	}

	// Debug: Log what we're comparing
	Logger.Debugf("Snyk projects count: %d", len(snykProjects))
	for i, p := range snykProjects {
		if i < 3 { // Only log first 3 to avoid spam
			Logger.Debugf("  Snyk project: %+v", p)
		}
	}
	Logger.Debugf("Bitbucket repos count: %d", len(bitbucketRepos))
	for i, r := range bitbucketRepos {
		if i < 3 { // Only log first 3 to avoid spam
			Logger.Debugf("  BB repo: %+v", r)
		}
	}

	// Compare states (pass manifestTypes for file pattern matching, not manifestProjectTypes)
	result := CompareStates(snykProjects, bitbucketRepos, manifestTypes)

	Logger.Infof("Sync comparison results:")
	Logger.Infof("- Missing repos (to add): %d", len(result.Missing))
	Logger.Infof("- Stale projects (to deactivate): %d", len(result.Stale))
	Logger.Infof("- Empty-importable repos: %d", len(result.ImportableEmpty))
	Logger.Infof("- Branch updates (to update): %d", len(result.BranchUpdates))

	if dryRun {
		Logger.Infof("Dry-run mode: no changes will be made")
		// Log planned actions
		for _, m := range result.Missing {
			Logger.Infof("[DRY-RUN] Would import: %v", m)
		}
		for _, bu := range result.BranchUpdates {
			Logger.Infof("[DRY-RUN] Would update branch %s -> %s for: %v", bu.OldBranch, bu.NewBranch, bu.NewSourceRepo)
		}
		for _, s := range result.Stale {
			Logger.Infof("[DRY-RUN] Would deactivate: %v", s)
		}
		return nil
	}

	// Collect project IDs to deactivate
	var deactivateIDs []string
	for _, p := range result.Stale {
		// skip if project type is 'sast'
		pType, _ := p["type"].(string)
		if pType == "sast" {
			continue
		}

		// extract manifest: prefer explicit 'manifest' field, otherwise parse from name after ':'
		manifest := ""
		if mv, ok := p["manifest"]; ok {
			if ms, ok2 := mv.(string); ok2 {
				manifest = strings.TrimSpace(ms)
			}
		}
		if manifest == "" {
			if namev, ok := p["name"]; ok {
				if nameStr, ok2 := namev.(string); ok2 {
					if strings.Contains(nameStr, ":") {
						parts := strings.SplitN(nameStr, ":", 2)
						manifest = strings.TrimSpace(parts[1])
					}
				}
			}
		}
		if manifest == "" {
			continue
		}

		// Only deactivate if project type is included in manifestProjectTypes
		allowed := false
		for _, mt := range manifestProjectTypes {
			if mt == pType {
				allowed = true
				break
			}
		}
		if !allowed {
			continue
		}

		if idv, ok := p["id"]; ok {
			if idStr, ok2 := idv.(string); ok2 && idStr != "" {
				deactivateIDs = append(deactivateIDs, idStr)
			}
		}
	}

	// Build planned actions for missing repos
	var actions []string
	for _, r := range result.Missing {
		projectKey := fmt.Sprintf("%v", r["projectKey"])
		repoSlug := fmt.Sprintf("%v", r["repoSlug"])
		branch := fmt.Sprintf("%v", r["branch"])
		manifest := fmt.Sprintf("%v", r["manifest"])

		fullName := projectKey + "/" + repoSlug
		if manifest != "" && manifest != "<nil>" {
			actions = append(actions, fmt.Sprintf("Would import %s@%s:%s", fullName, branch, manifest))
		} else {
			actions = append(actions, fmt.Sprintf("Would import %s@%s (no manifests)", fullName, branch))
		}
	}

	// Build planned actions for branch updates
	for _, bu := range result.BranchUpdates {
		r := bu.NewSourceRepo
		projectKey := fmt.Sprintf("%v", r["projectKey"])
		repoSlug := fmt.Sprintf("%v", r["repoSlug"])
		manifest := fmt.Sprintf("%v", r["manifest"])

		fullName := projectKey + "/" + repoSlug
		actions = append(actions, fmt.Sprintf("Would update branch %s -> %s for %s:%s", bu.OldBranch, bu.NewBranch, fullName, manifest))
	}

	if dryRun {
		Logger.Infof("Dry-run mode: no changes will be made")
		Logger.Infof("Planned imports: %d", len(actions))
		for _, action := range actions {
			Logger.Infof("[DRY-RUN] %s", action)
		}
		Logger.Infof("Planned deactivations: %d", len(deactivateIDs))
		for _, id := range deactivateIDs {
			Logger.Infof("[DRY-RUN] Would deactivate project %s", id)
		}
		return nil
	}

	// Execute branch updates via PATCH (update target_reference)
	if len(result.BranchUpdates) > 0 && !dryRun {
		Logger.Infof("Updating %d project branches via PATCH", len(result.BranchUpdates))

		var branchJobs []BranchUpdateJob
		for _, bu := range result.BranchUpdates {
			p := bu.OldSnykProject
			if idv, ok := p["id"]; ok {
				if idStr, ok2 := idv.(string); ok2 && idStr != "" {
					branchJobs = append(branchJobs, BranchUpdateJob{
						ProjectID: idStr,
						OldBranch: bu.OldBranch,
						NewBranch: bu.NewBranch,
					})
				}
			}
		}

		updateRes, updateErr := BulkUpdateProjectBranches(ctx, orgID, branchJobs, false)
		if updateErr != nil {
			Logger.Errorf("Branch update error: %v", updateErr)
		}

		for _, projectID := range updateRes.Success {
			Logger.Infof("Successfully updated project branch: %s", projectID)
		}

		// Fallback for failed updates (if enabled)
		if len(updateRes.Failed) > 0 {
			if enableBranchUpdateFallback {
				Logger.Warnf("%d branch updates failed via PATCH, will fall back to deactivate + import", len(updateRes.Failed))

				var fallbackImports []map[string]interface{}
				var fallbackDeactivate []string

				for failedProjectID := range updateRes.Failed {
					for _, bu := range result.BranchUpdates {
						p := bu.OldSnykProject
						if idv, ok := p["id"]; ok {
							if idStr, ok2 := idv.(string); ok2 && idStr == failedProjectID {
								fallbackDeactivate = append(fallbackDeactivate, idStr)
								fallbackImports = append(fallbackImports, bu.NewSourceRepo)
								break
							}
						}
					}
				}

				if len(fallbackDeactivate) > 0 {
					bdRes, _ := BulkDeactivateProjects(ctx, orgID, fallbackDeactivate, false)
					for _, sid := range bdRes.Success {
						Logger.Infof("Deactivated project: %s", sid)
					}
				}

				// Add fallback imports to the main missing list
				result.Missing = append(result.Missing, fallbackImports...)
			} else {
				Logger.Warnf("%d branch updates failed via PATCH (fallback disabled, use --enableBranchUpdateFallback to enable)", len(updateRes.Failed))
			}
		}
	}

	// Execute deactivations
	if len(deactivateIDs) > 0 && !dryRun {
		Logger.Infof("Deactivating %d stale projects", len(deactivateIDs))
		deactivateRes, _ := BulkDeactivateProjects(ctx, orgID, deactivateIDs, false)
		for _, projectID := range deactivateRes.Success {
			Logger.Infof("Successfully deactivated project: %s", projectID)
		}
		if len(deactivateRes.Failed) > 0 {
			Logger.Warnf("%d deactivations failed", len(deactivateRes.Failed))
		}
	}

	// Execute imports for missing repos
	if len(result.Missing) > 0 && !dryRun {
		Logger.Infof("Importing %d missing repos...", len(result.Missing))

		// Find the integration ID from targets
		integrationID := ""
		if len(targets.Targets) > 0 {
			integrationID = targets.Targets[0].IntegrationID
		}

		if integrationID == "" {
			// Try to discover the integration ID
			integrations, err := ListIntegrations(ctx, orgID)
			if err == nil {
				if id, ok := integrations["bitbucket-server"]; ok {
					integrationID = id
				}
			}
		}

		if integrationID == "" {
			return fmt.Errorf("no Bitbucket Server integration found for org %s", orgID)
		}

		if _, err := ParallelImportSyncMaps(ctx, result.Missing, orgID, integrationID, "bitbucket-server"); err != nil {
			return fmt.Errorf("import targets: %w", err)
		}

		Logger.Infof("Import completed successfully")
	}

	Logger.Infof("Sync completed successfully")
	return nil
}
