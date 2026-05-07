package cmd

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/snyk/snyk-api-import/internal"
	"github.com/snyk/snyk-api-import/internal/logging"
	"github.com/snyk/snyk-api-import/internal/security"
	"github.com/snyk/snyk-api-import/internal/utils"
)

// requireImportAllFlag checks if the --import-all flag is set when importing from workspaces.
// This is a safety check to prevent accidental bulk imports of all repositories.
func requireImportAllFlag(importAll bool, targetCount, workspaceCount int) {
	if !importAll {
		logging.Errorf("Found %d repositories to import from %d workspace(s).", targetCount, workspaceCount)
		logging.Errorf("This will import ALL discovered repositories into Snyk.")
		logging.Errorf("")
		logging.Errorf("To proceed, add the --import-all flag to confirm:")
		logging.Errorf("  %s --import-all", strings.Join(os.Args, " "))
		logging.Errorf("")
		logging.Errorf("Alternatively, use --file to import specific repositories from a targets file.")
		os.Exit(1)
	}
	logging.Infof("--import-all flag confirmed: importing %d repositories", targetCount)
}

// extractUniqueOwners reads the import targets file and returns a slice of unique owners.
// The function performs security validations on the file path and content.
// ImportCmd runs the import functionality using a config file and env vars
func ImportCmd(ctx context.Context, appCfg internal.AppConfig) {
	source := flag.String("source", "github", "Source type: bitbucket-cloud, bitbucket-cloud-app, bitbucket-server, github, github-enterprise, github-cloud-app, gitlab, or azure-repos")
	workspacesFlag := flag.String("workspaces", "", "Comma-separated list of workspaces")
	configPath := flag.String("config", "", "Path to import config JSON file (optional)")
	importData := flag.String("importData", "", "Path to import targets file (optional)")
	fileFlag := flag.String("file", "", "Alias for --importData; path to import targets file")
	concurrency := flag.Int("concurrency", 0, "Number of concurrent import workers (0 = use default from config/env, default: 10)")
	importAll := flag.Bool("import-all", false, "Required flag to confirm importing ALL repositories from workspaces (safety check)")
	flag.Parse()

	// The logger is already initialized in the internal package's init() function
	// No need to reinitialize it here

	logging.Debugf("Parsed flags: source=%s, importData=%s", *source, *importData)

	// Track if --file and --source were explicitly provided by user
	fileExplicitlyProvided := *fileFlag != ""
	sourceExplicitlyProvided := false
	for _, arg := range os.Args {
		if strings.HasPrefix(arg, "--source=") || arg == "--source" {
			sourceExplicitlyProvided = true
			break
		}
	}

	// If --file was used, prefer it as the import data path
	if *importData == "" && *fileFlag != "" {
		*importData = *fileFlag
	}

	// Set import concurrency if provided
	if *concurrency > 0 {
		if err := os.Setenv("IMPORT_CONCURRENCY", fmt.Sprintf("%d", *concurrency)); err != nil {
			logging.Errorf("Failed to set IMPORT_CONCURRENCY: %v", err)
			os.Exit(1)
		}
	}

	// Apply integration config from TOML based on --source flag
	if err := internal.ApplySourceConfigToEnv(*source); err != nil {
		logging.Debugf("Could not apply integration config for %s: %v", *source, err)
	}

	// Initialize variables that might be used later

	// If importData is present, try to infer the auth/source from the
	// integration type. For example, if any target's integration maps to
	// the Snyk integration key "bitbucket-connect-app", prefer the
	// bitbucket-cloud-app flow which uses client_id/client_secret.
	// Only auto-infer if --source was NOT explicitly provided.
	if *importData != "" && !sourceExplicitlyProvided {
		// Read the import data file securely
		const maxFileSize = 10 << 20 // 10MB
		data, err := security.SafeReadFile(*importData, maxFileSize)
		if err != nil {
			logging.Debugf("Could not read importData file for inference: %v", err)
		} else {
			// Parse the import data to check for integration type
			var targets []struct {
				IntegrationID string `json:"integrationID"`
			}
			if err := json.Unmarshal(data, &targets); err == nil {
				for _, t := range targets {
					if t.IntegrationID == "bitbucket-connect-app" {
						logging.Infof("Detected bitbucket-connect-app integration, using bitbucket-cloud-app source")
						*source = "bitbucket-cloud-app"
						break
					}
				}
			}
		}
	}

	// If no importData was provided and no workspaces specified, try to auto-detect
	// common generated targets files under SNYK_LOG_PATH so users can simply run
	// `snyk-api-import import` as described in docs after running `import:data`.
	// Skip auto-detection if workspaces are provided (user wants to discover repos).
	if *importData == "" && *workspacesFlag == "" {
		logPath := appCfg.SnykLogPath
		if logPath == "" {
			logPath = os.Getenv("SNYK_LOG_PATH")
		}
		if logPath != "" {
			// Build source-specific filename based on --source flag
			var sourceSpecificFile string
			switch *source {
			case "github", "github-com":
				sourceSpecificFile = "github-import-targets.json"
			case "github-cloud-app":
				sourceSpecificFile = "github-cloud-app-import-targets.json"
			case "github-enterprise":
				sourceSpecificFile = "github-enterprise-import-targets.json"
			case "gitlab":
				sourceSpecificFile = "gitlab-import-targets.json"
			case "bitbucket-cloud":
				sourceSpecificFile = "bitbucket-cloud-import-targets.json"
			case "bitbucket-cloud-app":
				sourceSpecificFile = "bitbucket-cloud-app-import-targets.json"
			case "bitbucket-server":
				sourceSpecificFile = "bitbucket-server-import-targets.json"
			case "azure-repos":
				sourceSpecificFile = "azure-repos-import-targets.json"
			}

			// Look for import files in the log path
			// Only check: 1) source-specific file, 2) generic import-targets.json
			// Do NOT fall back to other source files to avoid mismatched imports
			var possibleFiles []string

			// Add source-specific file first if we have one
			if sourceSpecificFile != "" {
				possibleFiles = append(possibleFiles, filepath.Join(logPath, sourceSpecificFile))
			}

			// Add generic fallback
			possibleFiles = append(possibleFiles, filepath.Join(logPath, "import-targets.json"))

			for _, f := range possibleFiles {
				// Use security.SafeReadFile to safely check if file exists and is readable
				// Allow up to 100MB for import targets files (they can be large for big organizations)
				if _, err := security.SafeReadFile(f, 100<<20); err == nil {
					*importData = f
					logging.Infof("Auto-detected import data file: %s", f)
					break
				}
			}
		}

		if *importData == "" {
			logging.Infof("No import data file specified and none found in SNYK_LOG_PATH")
			return
		}
	}

	// Validate that the import file matches the --source if file was explicitly provided
	if fileExplicitlyProvided && *importData != "" {
		if err := validateImportFileMatchesSource(ctx, *importData, *source); err != nil {
			logging.Warnf("Import file validation: %v", err)
			logging.Warnf("Continuing with import, but this may cause failures if the integration type doesn't match.")
		}
	}

	logPath := appCfg.SnykLogPath
	if logPath == "" {
		logPath = os.Getenv("SNYK_LOG_PATH")
	}
	if logPath == "" {
		logPath = "." // fallback to current directory
	}
	outPath := fmt.Sprintf("%s/import-results.json", logPath)

	// Resolve output path locally so sanitization is visible at the callsite
	// Note: resolvedOutPath is only used for legacy file-based imports
	resolvedOutPath, err := security.ResolveSafePath(outPath)
	if err != nil {
		logging.Errorf("Refusing to write results to unsafe path: %v", err)
		return
	}
	_ = resolvedOutPath // May be unused if --workspaces is provided

	var workspaces []string
	logging.Debugf("Initial workspaces: %v", workspaces)
	if *workspacesFlag != "" {
		for _, ws := range splitAndTrim(*workspacesFlag) {
			if ws != "" {
				workspaces = append(workspaces, ws)
			}
		}
	}
	logging.Debugf("After flag workspaces: %v", workspaces)
	var cfg *internal.ImportConfig
	if *configPath != "" {
		// Resolve and read config here using secure helpers so the file
		// open/read happens in this local scope (visible to static analyzers).
		resolvedConfig, err := security.ResolveSafePath(*configPath)
		if err != nil {
			logging.Errorf("unsafe config path: %v", err)
			os.Exit(1)
		}

		const maxConfigSize = 1 << 20 // 1MB
		cfgData, err := security.SafeReadFile(resolvedConfig, maxConfigSize)
		if err != nil {
			logging.Errorf("Failed to read config: %v", err)
			os.Exit(1)
		}

		var tmpCfg internal.ImportConfig
		if err := json.Unmarshal(cfgData, &tmpCfg); err != nil {
			logging.Errorf("Failed to parse config: %v", err)
			os.Exit(1)
		}
		cfg = &tmpCfg
		if len(workspaces) == 0 {
			workspaces = cfg.Workspaces
		}
	}
	logging.Debugf("After config workspaces: %v", workspaces)

	// Note: We do NOT infer workspaces from import targets file anymore.
	// If --file is provided, it should use the file-based import path (ImportTargetsParallel).
	// Workspace inference was causing --file imports to incorrectly trigger workspace discovery.

	logging.Debugf("Final workspaces: %v", workspaces)

	// Workspaces are only required if NOT using --file flag
	if len(workspaces) == 0 && *importData == "" {
		logging.ValidationErrorf("at least one workspace must be specified via --workspaces or config file")
		os.Exit(1)
	}

	switch *source {
	case "bitbucket-cloud":
		// Get Bitbucket Cloud auth (Basic Auth with username and API token)
		auth, err := internal.GetBitbucketCloudAuth()
		if err != nil {
			logging.Errorf("Error: Failed to get Bitbucket Cloud credentials: %v", err)
			logging.Errorf("Set BITBUCKET_CLOUD_USERNAME + BITBUCKET_CLOUD_PASSWORD, or BITBUCKET_CLOUD_API_TOKEN, or BITBUCKET_CLOUD_OAUTH_TOKEN")
			os.Exit(1)
		}
		logging.Infof("Using Bitbucket Cloud auth method: %s", auth.Method)

		// If using --workspaces flag, discover and import repos directly
		if len(workspaces) > 0 {
			// Get Snyk org ID and integration ID
			snykToken := os.Getenv("SNYK_TOKEN")
			orgID := os.Getenv("ORG_ID")
			if snykToken == "" || orgID == "" {
				logging.Errorf("SNYK_TOKEN and ORG_ID environment variables are required")
				os.Exit(1)
			}

			// Get integration ID for Bitbucket Cloud
			integrations, err := internal.ListIntegrations(ctx, orgID)
			if err != nil {
				logging.Errorf("Failed to list integrations: %v", err)
				os.Exit(1)
			}
			integrationID, ok := integrations["bitbucket-cloud"]
			if !ok {
				logging.Errorf("No bitbucket-cloud integration found for org %s", orgID)
				os.Exit(1)
			}

			// Discover repos from all workspaces
			var allImportTargets []internal.ImportTarget
			for _, ws := range workspaces {
				// Sanitize workspace to ensure it meets allowed pattern
				sWs, err := internal.SanitizeWorkspace(ws)
				if err != nil {
					logging.ValidationErrorf("Invalid workspace name: %s (%v)", ws, err)
					continue
				}
				repos, err := internal.FetchRepos(ctx, auth, sWs)
				if err != nil {
					logging.Errorf("Failed to fetch repos for workspace %s: %v", ws, err)
					continue
				}
				logging.Infof("Workspace: %s", ws)
				for _, r := range repos {
					logging.Infof("- %s (%s)", r.Name, r.FullName)
					// Convert to ImportTarget format
					allImportTargets = append(allImportTargets, internal.ImportTarget{
						Target: internal.Target{
							Name:     r.Name,
							FullName: r.FullName,
							Owner:    ws,
							Branch:   r.Branch,
						},
						OrgID:         orgID,
						IntegrationID: integrationID,
					})
				}
			}

			if len(allImportTargets) == 0 {
				logging.Infof("No repositories found to import")
				return
			}

			// Safety check: require --import-all flag for workspace imports
			requireImportAllFlag(*importAll, len(allImportTargets), len(workspaces))

			// Use parallel import
			config := internal.ParallelImportConfig{
				OrgID:         orgID,
				IntegrationID: integrationID,
				Source:        "bitbucket-cloud",
				Concurrency:   internal.GetImportConcurrency(*concurrency),
				SnykToken:     snykToken,
				PollTimeout:   internal.GetPollTimeout(),
				DryRun:        false,
			}

			logging.Infof("Starting parallel Bitbucket Cloud imports: %d targets, concurrency=%d", len(allImportTargets), config.Concurrency)
			results, err := internal.ParallelImport(ctx, allImportTargets, config)
			if err != nil {
				logging.Errorf("Parallel import error: %v", err)
				os.Exit(1)
			}

			// Log summary
			imported, failed, skipped := results.GetCounts()
			logging.Infof("Bitbucket Cloud import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
			return
		}

		// Legacy path: using --file flag with pre-generated targets
		if *importData != "" {
			resolvedImportData, err := internal.ResolveSafePath(*importData)
			if err != nil {
				logging.Errorf("unsafe importData path: %v", err)
				os.Exit(1)
			}
			logging.Infof("Running import for Bitbucket Cloud targets from file...")
			if err := internal.ImportBitbucketCloudTargets(ctx, resolvedImportData); err != nil {
				logging.Errorf("Import error: %v", err)
				os.Exit(1)
			}
		}
	case "bitbucket-cloud-app":
		clientID := ""
		clientSecret := ""
		// Prefer values from the typed AppConfig, then the optional import config file,
		// and finally fall back to environment variables for backward compatibility.
		if appCfg.BitbucketAppClientID != "" {
			clientID = appCfg.BitbucketAppClientID
		} else if cfg != nil {
			clientID = cfg.ClientID
		}
		if appCfg.BitbucketAppClientSecret != "" {
			clientSecret = appCfg.BitbucketAppClientSecret
		} else if cfg != nil {
			clientSecret = cfg.ClientSecret
		}
		if clientID == "" {
			clientID = os.Getenv("BITBUCKET_APP_CLIENT_ID")
		}
		if clientSecret == "" {
			clientSecret = os.Getenv("BITBUCKET_APP_CLIENT_SECRET")
		}
		if clientID == "" || clientSecret == "" {
			logging.ValidationErrorf("BITBUCKET_APP_CLIENT_ID and BITBUCKET_APP_CLIENT_SECRET env vars or values in config required")
			os.Exit(1)
		}
		token, err := internal.FetchBitbucketAppToken(ctx, clientID, clientSecret)
		if err != nil {
			logging.Errorf("Failed to get Bitbucket App token: %v", err)
			os.Exit(1)
		}

		// If using --workspaces flag, discover and import repos directly
		if len(workspaces) > 0 {
			// Get Snyk org ID and integration ID
			snykToken := os.Getenv("SNYK_TOKEN")
			orgID := os.Getenv("ORG_ID")
			if snykToken == "" || orgID == "" {
				logging.Errorf("SNYK_TOKEN and ORG_ID environment variables are required")
				os.Exit(1)
			}

			// Get integration ID for Bitbucket Cloud App
			integrations, err := internal.ListIntegrations(ctx, orgID)
			if err != nil {
				logging.Errorf("Failed to list integrations: %v", err)
				os.Exit(1)
			}
			integrationID, ok := integrations["bitbucket-cloud-app"]
			if !ok {
				logging.Errorf("No bitbucket-cloud-app integration found for org %s", orgID)
				os.Exit(1)
			}

			// Discover repos from all workspaces
			var allImportTargets []internal.ImportTarget
			for _, ws := range workspaces {
				// Sanitize workspace name before using it for API calls
				sWs, err := internal.SanitizeWorkspace(ws)
				if err != nil {
					logging.ValidationErrorf("Invalid workspace name: %s (%v)", ws, err)
					continue
				}
				repos, err := internal.FetchBitbucketAppRepos(ctx, token, sWs)
				if err != nil {
					logging.Errorf("Failed to fetch repos for workspace %s: %v", ws, err)
					continue
				}
				logging.Infof("Workspace: %s", ws)
				for _, r := range repos {
					logging.Infof("- %s (%s)", r.Name, r.FullName)
					// Convert to ImportTarget format
					allImportTargets = append(allImportTargets, internal.ImportTarget{
						Target: internal.Target{
							Name:     r.Name,
							FullName: r.FullName,
							Owner:    ws,
							Branch:   r.Branch,
						},
						OrgID:         orgID,
						IntegrationID: integrationID,
					})
				}
			}

			if len(allImportTargets) == 0 {
				logging.Infof("No repositories found to import")
				return
			}

			// Safety check: require --import-all flag for workspace imports
			requireImportAllFlag(*importAll, len(allImportTargets), len(workspaces))

			// Use parallel import
			config := internal.ParallelImportConfig{
				OrgID:         orgID,
				IntegrationID: integrationID,
				Source:        "bitbucket-cloud",
				Concurrency:   internal.GetImportConcurrency(*concurrency),
				SnykToken:     snykToken,
				PollTimeout:   internal.GetPollTimeout(),
				DryRun:        false,
			}

			logging.Infof("Starting parallel Bitbucket Cloud App imports: %d targets, concurrency=%d", len(allImportTargets), config.Concurrency)
			results, err := internal.ParallelImport(ctx, allImportTargets, config)
			if err != nil {
				logging.Errorf("Parallel import error: %v", err)
				os.Exit(1)
			}

			// Log summary
			imported, failed, skipped := results.GetCounts()
			logging.Infof("Bitbucket Cloud App import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
			return
		}

		// Legacy path: using --file flag with pre-generated targets
		if *importData != "" {
			resolvedImportData, err := internal.ResolveSafePath(*importData)
			if err != nil {
				logging.Errorf("unsafe importData path: %v", err)
				os.Exit(1)
			}
			logging.Infof("Running import for Bitbucket Cloud App targets from file...")
			if err := internal.ImportTargetsParallel(ctx, resolvedImportData, "bitbucket-cloud-app"); err != nil {
				logging.Errorf("Import error: %v", err)
				os.Exit(1)
			}
		}
	case "github", "github-com", "github-enterprise":
		// GitHub with Personal Access Token
		auth, err := internal.GetGitHubAuth()
		if err != nil {
			logging.Errorf("Error: Failed to get GitHub credentials: %v", err)
			logging.Errorf("Set GITHUB_TOKEN environment variable")
			os.Exit(1)
		}
		logging.Infof("Using GitHub authentication (PAT)")

		// If using --workspaces flag, discover and import repos directly
		if len(workspaces) > 0 {
			// Get Snyk org ID and integration ID
			snykToken := os.Getenv("SNYK_TOKEN")
			orgID := os.Getenv("ORG_ID")
			if snykToken == "" || orgID == "" {
				logging.Errorf("SNYK_TOKEN and ORG_ID environment variables are required")
				os.Exit(1)
			}

			// Determine integration key based on source
			integrationKey := "github"
			if *source == "github-enterprise" {
				integrationKey = "github-enterprise"
			}

			// Get integration ID
			integrations, err := internal.ListIntegrations(ctx, orgID)
			if err != nil {
				logging.Errorf("Failed to list integrations: %v", err)
				os.Exit(1)
			}
			integrationID, ok := integrations[integrationKey]
			if !ok {
				logging.Errorf("No %s integration found for org %s", integrationKey, orgID)
				os.Exit(1)
			}

			// Discover repos from all organizations
			var allImportTargets []internal.ImportTarget
			for _, org := range workspaces {
				repos, err := internal.FetchGitHubRepos(ctx, auth, org, nil)
				if err != nil {
					logging.Errorf("Failed to fetch repos for org %s: %v", org, err)
					continue
				}
				logging.Infof("Organization: %s", org)
				for _, r := range repos {
					owner := r["owner"]
					name := r["name"]
					branch := r["branch"]
					if branch == "" {
						branch = "main"
					}
					logging.Infof("- %s (%s/%s)", name, owner, name)
					// Convert to ImportTarget format
					allImportTargets = append(allImportTargets, internal.ImportTarget{
						Target: internal.Target{
							Name:   name,
							Owner:  owner,
							Branch: branch,
						},
						OrgID:         orgID,
						IntegrationID: integrationID,
					})
				}
			}

			if len(allImportTargets) == 0 {
				logging.Infof("No repositories found to import")
				return
			}

			// Safety check: require --import-all flag for workspace imports
			requireImportAllFlag(*importAll, len(allImportTargets), len(workspaces))

			// Use parallel import
			config := internal.ParallelImportConfig{
				OrgID:         orgID,
				IntegrationID: integrationID,
				Source:        "github",
				Concurrency:   internal.GetImportConcurrency(*concurrency),
				SnykToken:     snykToken,
				PollTimeout:   internal.GetPollTimeout(),
				DryRun:        false,
			}

			logging.Infof("Starting parallel GitHub imports: %d targets, concurrency=%d", len(allImportTargets), config.Concurrency)
			results, err := internal.ParallelImport(ctx, allImportTargets, config)
			if err != nil {
				logging.Errorf("Parallel import error: %v", err)
				os.Exit(1)
			}

			// Log summary
			imported, failed, skipped := results.GetCounts()
			logging.Infof("GitHub import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
			return
		}

		// Legacy path: using --file flag with pre-generated targets
		if *importData != "" {
			resolvedImportData, err := internal.ResolveSafePath(*importData)
			if err != nil {
				logging.Errorf("unsafe importData path: %v", err)
				os.Exit(1)
			}
			logging.Infof("Running import for GitHub targets from file...")
			if err := internal.ImportTargetsParallel(ctx, resolvedImportData, "github"); err != nil {
				logging.Errorf("Import error: %v", err)
				os.Exit(1)
			}
		}
	case "github-cloud-app":
		// GitHub App with OAuth
		config, err := internal.GetGitHubAppConfig()
		if err != nil {
			logging.Errorf("Error: Failed to get GitHub App config: %v", err)
			logging.Errorf("Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY environment variables")
			os.Exit(1)
		}

		token, err := internal.FetchGitHubAppToken(ctx, config)
		if err != nil {
			logging.Errorf("Failed to get GitHub App token: %v", err)
			os.Exit(1)
		}
		logging.Infof("Using GitHub App authentication")

		// If using --workspaces flag, discover and import repos directly
		if len(workspaces) > 0 {
			// Get Snyk org ID and integration ID
			snykToken := os.Getenv("SNYK_TOKEN")
			orgID := os.Getenv("ORG_ID")
			if snykToken == "" || orgID == "" {
				logging.Errorf("SNYK_TOKEN and ORG_ID environment variables are required")
				os.Exit(1)
			}

			// Get integration ID for GitHub Cloud App
			integrations, err := internal.ListIntegrations(ctx, orgID)
			if err != nil {
				logging.Errorf("Failed to list integrations: %v", err)
				os.Exit(1)
			}
			integrationID, ok := integrations["github-cloud-app"]
			if !ok {
				logging.Errorf("No github-cloud-app integration found for org %s", orgID)
				os.Exit(1)
			}

			// Discover repos from all organizations
			var allImportTargets []internal.ImportTarget
			for _, org := range workspaces {
				repos, err := internal.FetchGitHubAppRepos(ctx, token, org, nil)
				if err != nil {
					logging.Errorf("Failed to fetch repos for org %s: %v", org, err)
					continue
				}
				logging.Infof("Organization: %s", org)
				for _, r := range repos {
					owner := r["owner"]
					name := r["name"]
					branch := r["branch"]
					if branch == "" {
						branch = "main"
					}
					logging.Infof("- %s (%s/%s)", name, owner, name)
					// Convert to ImportTarget format
					allImportTargets = append(allImportTargets, internal.ImportTarget{
						Target: internal.Target{
							Name:   name,
							Owner:  owner,
							Branch: branch,
						},
						OrgID:         orgID,
						IntegrationID: integrationID,
					})
				}
			}

			if len(allImportTargets) == 0 {
				logging.Infof("No repositories found to import")
				return
			}

			// Safety check: require --import-all flag for workspace imports
			requireImportAllFlag(*importAll, len(allImportTargets), len(workspaces))

			// Use parallel import
			config := internal.ParallelImportConfig{
				OrgID:         orgID,
				IntegrationID: integrationID,
				Source:        "github",
				Concurrency:   internal.GetImportConcurrency(*concurrency),
				SnykToken:     snykToken,
				PollTimeout:   internal.GetPollTimeout(),
				DryRun:        false,
			}

			logging.Infof("Starting parallel GitHub App imports: %d targets, concurrency=%d", len(allImportTargets), config.Concurrency)
			results, err := internal.ParallelImport(ctx, allImportTargets, config)
			if err != nil {
				logging.Errorf("Parallel import error: %v", err)
				os.Exit(1)
			}

			// Log summary
			imported, failed, skipped := results.GetCounts()
			logging.Infof("GitHub App import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
			return
		}

		// Legacy path: using --file flag with pre-generated targets
		if *importData != "" {
			resolvedImportData, err := internal.ResolveSafePath(*importData)
			if err != nil {
				logging.Errorf("unsafe importData path: %v", err)
				os.Exit(1)
			}
			logging.Infof("Running import for GitHub App targets from file...")
			if err := internal.ImportTargetsParallel(ctx, resolvedImportData, "github-cloud-app"); err != nil {
				logging.Errorf("Import error: %v", err)
				os.Exit(1)
			}
		}
	case "gitlab":
		// GitLab with Personal Access Token
		auth, err := internal.GetGitLabAuth()
		if err != nil {
			logging.Errorf("Error: Failed to get GitLab credentials: %v", err)
			logging.Errorf("Set GITLAB_TOKEN environment variable")
			os.Exit(1)
		}
		logging.Infof("Using GitLab instance: %s", auth.BaseURL)

		// If using --workspaces flag, discover and import repos directly
		if len(workspaces) > 0 {
			// Get Snyk org ID and integration ID
			snykToken := os.Getenv("SNYK_TOKEN")
			orgID := os.Getenv("ORG_ID")
			if snykToken == "" || orgID == "" {
				logging.Errorf("SNYK_TOKEN and ORG_ID environment variables are required")
				os.Exit(1)
			}

			// Get integration ID for GitLab
			integrations, err := internal.ListIntegrations(ctx, orgID)
			if err != nil {
				logging.Errorf("Failed to list integrations: %v", err)
				os.Exit(1)
			}
			integrationID, ok := integrations["gitlab"]
			if !ok {
				logging.Errorf("No gitlab integration found for org %s", orgID)
				os.Exit(1)
			}

			// Discover repos from all groups
			var allImportTargets []internal.ImportTarget
			for _, group := range workspaces {
				repos, err := internal.ListGitLabRepos(ctx, auth, group)
				if err != nil {
					logging.Errorf("Failed to fetch projects for group %s: %v", group, err)
					continue
				}
				logging.Infof("Group: %s", group)
				for _, r := range repos {
					logging.Infof("- %s (%s)", r.Name, r.PathWithNamespace)
					// Convert to ImportTarget format
					allImportTargets = append(allImportTargets, internal.ImportTarget{
						Target: internal.Target{
							ID:       r.ID,
							Name:     r.Name,
							FullName: r.PathWithNamespace,
							Owner:    group,
							Branch:   r.DefaultBranch,
						},
						OrgID:         orgID,
						IntegrationID: integrationID,
					})
				}
			}

			if len(allImportTargets) == 0 {
				logging.Infof("No repositories found to import")
				return
			}

			// Safety check: require --import-all flag for workspace imports
			requireImportAllFlag(*importAll, len(allImportTargets), len(workspaces))

			// Use parallel import
			config := internal.ParallelImportConfig{
				OrgID:         orgID,
				IntegrationID: integrationID,
				Source:        "gitlab",
				Concurrency:   internal.GetImportConcurrency(*concurrency),
				SnykToken:     snykToken,
				PollTimeout:   internal.GetPollTimeout(),
				DryRun:        false,
			}

			logging.Infof("Starting parallel GitLab imports: %d targets, concurrency=%d", len(allImportTargets), config.Concurrency)
			results, err := internal.ParallelImport(ctx, allImportTargets, config)
			if err != nil {
				logging.Errorf("Parallel import error: %v", err)
				os.Exit(1)
			}

			// Log summary
			imported, failed, skipped := results.GetCounts()
			logging.Infof("GitLab import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
			return
		}

		// Legacy path: using --file flag with pre-generated targets
		if *importData != "" {
			resolvedImportData, err := internal.ResolveSafePath(*importData)
			if err != nil {
				logging.Errorf("unsafe importData path: %v", err)
				os.Exit(1)
			}
			logging.Infof("Running import for GitLab targets from file...")
			if err := internal.ImportTargetsParallel(ctx, resolvedImportData, "gitlab"); err != nil {
				logging.Errorf("Import error: %v", err)
				os.Exit(1)
			}
		}
	case "azure-repos":
		// Azure DevOps with Personal Access Token
		auth, err := internal.GetAzureAuth()
		if err != nil {
			logging.Errorf("Error: Failed to get Azure DevOps credentials: %v", err)
			logging.Errorf("Set AZURE_TOKEN environment variable")
			os.Exit(1)
		}
		logging.Infof("Using Azure DevOps instance: %s", auth.BaseURL)

		// If using --workspaces flag, discover and import repos directly
		if len(workspaces) > 0 {
			// Get Snyk org ID and integration ID
			snykToken := os.Getenv("SNYK_TOKEN")
			orgID := os.Getenv("ORG_ID")
			if snykToken == "" || orgID == "" {
				logging.Errorf("SNYK_TOKEN and ORG_ID environment variables are required")
				os.Exit(1)
			}

			// Get integration ID for Azure DevOps
			integrations, err := internal.ListIntegrations(ctx, orgID)
			if err != nil {
				logging.Errorf("Failed to list integrations: %v", err)
				os.Exit(1)
			}
			integrationID, ok := integrations["azure-repos"]
			if !ok {
				logging.Errorf("No azure-repos integration found for org %s", orgID)
				os.Exit(1)
			}

			// Discover repos from all Azure organizations
			var allImportTargets []internal.ImportTarget
			for _, azureOrg := range workspaces {
				repos, err := internal.ListAllAzureRepos(ctx, auth, azureOrg)
				if err != nil {
					logging.Errorf("Failed to fetch projects for Azure org %s: %v", azureOrg, err)
					continue
				}
				logging.Infof("Azure Organization: %s", azureOrg)
				for _, r := range repos {
					name := r["name"]
					owner := r["owner"]
					branch := r["branch"]
					logging.Infof("  - Repo: %s (Project: %s, Branch: %s)", name, owner, branch)
					// Convert to ImportTarget format
					allImportTargets = append(allImportTargets, internal.ImportTarget{
						Target: internal.Target{
							Name:   name,
							Owner:  owner,
							Branch: branch,
						},
						OrgID:         orgID,
						IntegrationID: integrationID,
					})
				}
			}

			if len(allImportTargets) == 0 {
				logging.Infof("No repositories found to import")
				return
			}

			// Safety check: require --import-all flag for workspace imports
			requireImportAllFlag(*importAll, len(allImportTargets), len(workspaces))

			// Use parallel import
			config := internal.ParallelImportConfig{
				OrgID:         orgID,
				IntegrationID: integrationID,
				Source:        "azure-repos",
				Concurrency:   internal.GetImportConcurrency(*concurrency),
				SnykToken:     snykToken,
				PollTimeout:   internal.GetPollTimeout(),
				DryRun:        false,
			}

			logging.Infof("Starting parallel Azure DevOps imports: %d targets, concurrency=%d", len(allImportTargets), config.Concurrency)
			results, err := internal.ParallelImport(ctx, allImportTargets, config)
			if err != nil {
				logging.Errorf("Parallel import error: %v", err)
				os.Exit(1)
			}

			// Log summary
			imported, failed, skipped := results.GetCounts()
			logging.Infof("Azure DevOps import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
			return
		}

		// Legacy path: using --file flag with pre-generated targets
		if *importData != "" {
			resolvedImportData, err := internal.ResolveSafePath(*importData)
			if err != nil {
				logging.Errorf("unsafe importData path: %v", err)
				os.Exit(1)
			}
			logging.Infof("Running import for Azure DevOps targets from file...")
			if err := internal.ImportTargetsParallel(ctx, resolvedImportData, "azure-repos"); err != nil {
				logging.Errorf("Import error: %v", err)
				os.Exit(1)
			}
		}
	case "bitbucket-server":
		// Bitbucket Server (Data Center) - import only from targets file
		if *importData == "" {
			logging.Errorf("Bitbucket Server requires --file parameter with import targets")
			os.Exit(1)
		}
		resolvedImportData, err := internal.ResolveSafePath(*importData)
		if err != nil {
			logging.Errorf("unsafe importData path: %v", err)
			os.Exit(1)
		}
		logging.Infof("Running import for Bitbucket Server targets...")
		if err := internal.ImportTargetsParallel(ctx, resolvedImportData, "bitbucket-server"); err != nil {
			logging.Errorf("Import error: %v", err)
			os.Exit(1)
		}
	default:
		logging.Errorf("Unknown source: %s", *source)
		os.Exit(1)
	}
}

// splitAndTrim splits a comma-separated string and trims whitespace
func splitAndTrim(s string) []string {
	var out []string
	for _, part := range splitComma(s) {
		out = append(out, trimSpace(part))
	}
	return out
}

func splitComma(s string) []string {
	var out []string
	curr := ""
	for _, c := range s {
		if c == ',' {
			out = append(out, curr)
			curr = ""
		} else {
			curr += string(c)
		}
	}
	if curr != "" {
		out = append(out, curr)
	}
	return out
}

func trimSpace(s string) string {
	i := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n') {
		i++
	}
	j := len(s) - 1
	for j >= i && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n') {
		j--
	}
	if i > j {
		return ""
	}
	return s[i : j+1]
}

// (removed) safeHTTPGet was unused; network-safe helpers live in internal/security

// writeResults writes the results to a file in JSON format using secure file operations.
// This function is kept for backward compatibility and testing purposes, even though
// the parallel import path no longer uses it (results are logged instead).
//
//nolint:unused // Used by tests in import_test.go and write_results_test.go
func writeResults(path string, results map[string]interface{}) {
	if path == "" {
		path = "import-results.json"
	}

	// Ensure the path is safe and resolve it
	safePath, err := security.ResolveSafePath(path)
	if err != nil {
		logging.ValidationErrorf("Invalid output path: %v", err)
		return
	}

	// Ensure the directory exists
	dir := filepath.Dir(safePath)
	if dir != "." {
		// Create directory with secure permissions (owner read/write/execute only)
		if err := os.MkdirAll(dir, 0700); err != nil {
			logging.Errorf("Failed to create directory %s: %v", dir, err)
			return
		}
	}

	// Marshal and write via OutputDestination to keep file writes testable
	b, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		logging.Errorf("Failed to marshal results: %v", err)
		return
	}
	odi := utils.NewOutputDestination()
	if err := odi.WriteFile(safePath, b, 0600); err != nil {
		logging.Errorf("Failed to write results: %v", err)
		return
	}

	logging.Infof("Results written to: %s", safePath)
}

// validateImportFileMatchesSource validates that the import targets file contains
// integration IDs that match the expected source type
func validateImportFileMatchesSource(ctx context.Context, importFile, source string) error {
	// Read the import file
	const maxFileSize = 10 << 20 // 10MB
	data, err := security.SafeReadFile(importFile, maxFileSize)
	if err != nil {
		return fmt.Errorf("failed to read import file: %w", err)
	}

	// Parse the targets to get orgID and integrationID
	var targets []internal.ImportTarget
	if err := json.Unmarshal(data, &targets); err != nil {
		return fmt.Errorf("failed to parse import file: %w", err)
	}

	if len(targets) == 0 {
		return fmt.Errorf("import file contains no targets")
	}

	// Get the first target's org and integration ID
	firstTarget := targets[0]
	if firstTarget.OrgID == "" {
		return fmt.Errorf("targets missing orgId field")
	}
	if firstTarget.IntegrationID == "" {
		return fmt.Errorf("targets missing integrationId field")
	}

	// Query Snyk API to get all integrations for this org
	integrations, err := internal.ListIntegrations(ctx, firstTarget.OrgID)
	if err != nil {
		// If we can't query the API, skip validation (might be offline, wrong token, etc.)
		logging.Debugf("Could not query integrations for validation: %v", err)
		return nil
	}

	// Map source to expected integration type keys
	expectedKeys := getExpectedIntegrationKeys(source)
	if len(expectedKeys) == 0 {
		// Unknown source type, skip validation
		return nil
	}

	// Check if the integration ID in the file matches any of the expected integration types
	for _, key := range expectedKeys {
		if integrationID, ok := integrations[key]; ok && integrationID == firstTarget.IntegrationID {
			// Match found!
			logging.Debugf("Validated: import file integration ID matches %s", key)
			return nil
		}
	}

	// No match found - warn the user
	var availableTypes []string
	for key, id := range integrations {
		if id == firstTarget.IntegrationID {
			availableTypes = append(availableTypes, key)
		}
	}

	if len(availableTypes) > 0 {
		return fmt.Errorf("integration ID in file matches '%s' but --source is '%s'",
			strings.Join(availableTypes, "' or '"), source)
	}

	return fmt.Errorf("integration ID in file does not match any integration for --source=%s", source)
}

// getExpectedIntegrationKeys returns the Snyk integration type keys expected for a given source
func getExpectedIntegrationKeys(source string) []string {
	switch source {
	case "github", "github-com":
		return []string{"github"}
	case "github-enterprise":
		return []string{"github-enterprise"}
	case "github-cloud-app":
		return []string{"github-cloud-app"}
	case "gitlab":
		return []string{"gitlab", "gitlab-enterprise"}
	case "bitbucket-cloud":
		return []string{"bitbucket-cloud"}
	case "bitbucket-cloud-app":
		return []string{"bitbucket-connect-app"} // Note: Snyk uses "bitbucket-connect-app" as the key
	case "bitbucket-server":
		return []string{"bitbucket-server"}
	case "azure-repos":
		return []string{"azure-repos"}
	default:
		return nil
	}
}

// workspace validation moved to internal.SanitizeWorkspace
