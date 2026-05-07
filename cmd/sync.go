package cmd

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sam1el/snyk-api-import-go/internal"
	"github.com/sam1el/snyk-api-import-go/internal/logging"
)

// SyncCmd syncs orgs/projects with source control systems (Bitbucket, GitHub, GitLab, Azure DevOps).
// It respects the provided context by returning early if ctx is cancelled.
// Note: some underlying sync functions may be executed in goroutines and may
// continue running; this wrapper demonstrates cancellation at the command level.
func SyncCmd(ctx context.Context, cfg internal.AppConfig) {
	fs := flag.NewFlagSet("sync", flag.ExitOnError)
	orgPublicID := fs.String("orgPublicId", "", "Snyk org public ID")
	source := fs.String("source", "github", "Source type (bitbucket-cloud, bitbucket-cloud-app, bitbucket-server, github, github-enterprise, github-cloud-app, gitlab, azure-repos)")
	sourceURL := fs.String("sourceUrl", "", "Custom source control URL (for GitHub Enterprise, self-hosted GitLab, Bitbucket Server, Azure DevOps Server)")
	snykProduct := fs.String("snykProduct", "", "Filter by Snyk product (openSource, container, iac)")
	exclusionGlobs := fs.String("exclusionGlobs", "", "Comma-separated list of glob patterns to exclude from manifest discovery")
	dryRun := fs.Bool("dryRun", false, "Show planned actions, do not execute")
	verbose := fs.Bool("verbose", false, "Enable verbose (debug) logging")
	enableBranchUpdateFallback := fs.Bool("enableBranchUpdateFallback", false, "Enable fallback to deactivate+import if PATCH branch update fails")
	concurrency := fs.Int("concurrency", 0, "Number of concurrent import workers (0 = use default from config/env, default: 10)")
	if err := fs.Parse(os.Args[2:]); err != nil {
		logging.Errorf("Error parsing flags: %v", err)
		return
	}

	// Check if source is provided
	if *source == "" {
		logging.ValidationErrorf("--source is required")
		return
	}

	if *verbose {
		internal.SetDebug(true)
	}

	// Apply integration config from TOML based on --source flag
	// This will set ORG_ID from config.toml if present
	if err := internal.ApplySourceConfigToEnv(*source); err != nil {
		logging.Debugf("Could not apply integration config for %s: %v", *source, err)
	}

	// If orgPublicID not provided via CLI, try to get it from ORG_ID env var
	// (which was just set by ApplySourceConfigToEnv if present in config.toml)
	if *orgPublicID == "" {
		*orgPublicID = os.Getenv("ORG_ID")
		if *orgPublicID != "" {
			logging.Debugf("Using ORG_ID from config.toml: %s", *orgPublicID)
		}
	}

	// Final validation
	if *orgPublicID == "" {
		logging.ValidationErrorf("--orgPublicID is required (provide via CLI flag or config.toml)")
		return
	}

	// Handle custom source URL if provided
	if *sourceURL != "" {
		var envVar, envVal string
		switch *source {
		case "github", "github-com", "github-cloud-app":
			envVar, envVal = "GITHUB_API_URL", *sourceURL
		case "gitlab":
			envVar, envVal = "GITLAB_BASE_URL", *sourceURL
		case "azure-repos":
			envVar, envVal = "AZURE_BASE_URL", *sourceURL
		case "bitbucket-server":
			envVar, envVal = "BITBUCKET_SERVER_URL", *sourceURL
		default:
			logging.Warnf("--sourceURL is not applicable for source type %s", *source)
		}
		if envVar != "" {
			if err := os.Setenv(envVar, envVal); err != nil {
				logging.Errorf("Failed to set %s: %v", envVar, err)
				return
			}
		}
	}

	// Set exclusion globs environment variable if provided
	if *exclusionGlobs != "" {
		if err := os.Setenv("EXCLUSION_GLOBS", *exclusionGlobs); err != nil {
			logging.Errorf("Failed to set EXCLUSION_GLOBS: %v", err)
			return
		}
	}

	// Set Snyk product filter if provided
	if *snykProduct != "" {
		// Validate product value
		validProducts := map[string]bool{
			"openSource": true,
			"container":  true,
			"iac":        true,
		}
		if !validProducts[*snykProduct] {
			logging.ValidationErrorf("Invalid --snykProduct value: %s. Must be one of: openSource, container, iac", *snykProduct)
			return
		}
		if err := os.Setenv("SNYK_PRODUCT", *snykProduct); err != nil {
			logging.Errorf("Failed to set SNYK_PRODUCT: %v", err)
			return
		}
	}

	// Set import concurrency if provided
	if *concurrency > 0 {
		if err := os.Setenv("IMPORT_CONCURRENCY", fmt.Sprintf("%d", *concurrency)); err != nil {
			logging.Errorf("Failed to set IMPORT_CONCURRENCY: %v", err)
			return
		}
	}

	// If orgPublicID was provided on the CLI, export it to ORG_ID so
	// internal code that expects the ORG_ID env var will work.
	if *orgPublicID != "" {
		if err := os.Setenv("ORG_ID", *orgPublicID); err != nil {
			logging.Errorf("Failed to set ORG_ID environment variable: %v", err)
			return
		}
		logging.Debugf("Set ORG_ID from --orgPublicID")
	}

	snykLogPath := cfg.SnykLogPath
	if snykLogPath == "" {
		snykLogPath = os.Getenv("SNYK_LOG_PATH")
	}
	if snykLogPath == "" {
		logging.ValidationErrorf("SNYK_LOG_PATH environment variable is not set.")
		return
	}

	// Infer targetsFile from SNYK_LOG_PATH and source. We do NOT use or log an orgs
	// file for bitbucket-cloud-app; the sync flow should be driven only by the
	// targets file ("<source>-import-targets.json"). Use filepath.Join and
	// validate the resolved path before passing into internal code.
	// Build a safe filename from the source (strip any path components)
	safeFilename := filepath.Base(fmt.Sprintf("%s-import-targets.json", *source))
	targetsFile := filepath.Join(snykLogPath, safeFilename)
	expandedTargets := os.ExpandEnv(targetsFile)
	// #nosec G304 - Path is validated via ResolveSafePath which ensures it's within SNYK_LOG_PATH
	resolvedTargets, err := internal.ResolveSafePath(expandedTargets)
	if err != nil {
		logging.Errorf("Derived targets file path rejected: %v", err)
		return
	}
	// Log which targets file we will use (helpful to verify SNYK_LOG_PATH behavior)
	logging.Debugf("Using targets file: %s", resolvedTargets)

	switch *source {
	case "bitbucket-cloud-app":
		// pass empty orgsFile — internal code should not rely on it for targets-driven syncs
		if err := internal.SyncBitbucketCloudApp(ctx, *orgPublicID, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback, true); err != nil {
			if err == context.Canceled {
				logging.Infof("Sync cancelled by context")
				return
			}
			logging.Errorf("Sync failed: %v", err)
		}
	case "bitbucket-cloud":
		// snyk:ignore Path Traversal: https://snyk.io/vuln/SNYK-GO-PATHTRAV-001
		if err := internal.SyncBitbucketCloud(*orgPublicID, *source, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback, true); err != nil {
			logging.Errorf("Sync failed: %v", err)
		}
	case "github", "github-com", "github-enterprise":
		// deepreason:ignore Path validated via ResolveSafePath before passing to sync functions
		if err := internal.SyncGitHub(*orgPublicID, *source, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback, true); err != nil {
			logging.Errorf("Sync failed: %v", err)
		}
	case "github-cloud-app":
		// Use GitHub sync for GitHub Cloud App (same as regular GitHub)
		// deepreason:ignore Path validated via ResolveSafePath before passing to sync functions
		if err := internal.SyncGitHub(*orgPublicID, *source, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback, true); err != nil {
			logging.Errorf("Sync failed: %v", err)
		}
	case "gitlab":
		// deepreason:ignore Path validated via ResolveSafePath before passing to sync functions
		if err := internal.SyncGitLab(*orgPublicID, *source, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback); err != nil {
			logging.Errorf("Sync failed: %v", err)
		}
	case "azure-repos":
		// #nosec G304 -- path validated by security checks
		// deepreason:ignore
		if err := internal.SyncAzure(*orgPublicID, *source, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback); err != nil {
			logging.Errorf("Sync failed: %v", err)
		}
	case "bitbucket-server":
		if err := internal.SyncBitbucketServerContext(ctx, *orgPublicID, "", resolvedTargets, *dryRun, snykLogPath, *enableBranchUpdateFallback); err != nil {
			if err == context.Canceled {
				logging.Infof("Sync cancelled by context")
				return
			}
			logging.Errorf("Sync failed: %v", err)
		}
	default:
		logging.Errorf("Unknown source: %s", *source)
		return
	}
}
