package cmd

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"

	"github.com/snyk/snyk-api-import/internal"
	"github.com/snyk/snyk-api-import/internal/logging"
	"github.com/snyk/snyk-api-import/internal/utils"
)

// ImportDataCmd generates import targets from orgs data
func ImportDataCmd(ctx context.Context, cfg internal.AppConfig) {
	fs := flag.NewFlagSet("import:data", flag.ExitOnError)
	orgsData := fs.String("orgsData", "snyk-created-orgs.json", "Path to orgs data file")
	source := fs.String("source", "github", "Source type")
	sourceURL := fs.String("sourceUrl", "", "Custom source control URL (for GitHub Enterprise, self-hosted GitLab, Bitbucket Server, Azure DevOps Server)")
	integrationID := fs.String("integrationId", "", "Integration ID to set for all targets")

	if err := fs.Parse(os.Args[2:]); err != nil {
		logging.Errorf("Error parsing flags: %v", err)
		os.Exit(1)
	}

	if *orgsData == "" {
		logging.ValidationErrorf("--orgsData is required")
		os.Exit(1)
	}

	// Apply integration config from TOML based on --source flag
	if err := internal.ApplySourceConfigToEnv(*source); err != nil {
		logging.Debugf("Could not apply integration config for %s: %v", *source, err)
	}

	// Handle custom source URL if provided
	if *sourceURL != "" {
		switch *source {
		case "github", "github-com", "github-cloud-app":
			if err := os.Setenv("GITHUB_API_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set GITHUB_API_URL: %v", err)
				os.Exit(1)
			}
		case "gitlab":
			if err := os.Setenv("GITLAB_BASE_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set GITLAB_BASE_URL: %v", err)
				os.Exit(1)
			}
		case "azure-repos":
			if err := os.Setenv("AZURE_BASE_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set AZURE_BASE_URL: %v", err)
				os.Exit(1)
			}
		case "bitbucket-server":
			if err := os.Setenv("BITBUCKET_SERVER_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set BITBUCKET_SERVER_URL: %v", err)
				os.Exit(1)
			}
		default:
			logging.Warnf("--sourceURL is not applicable for source type %s", *source)
		}
	}

	// Get snykLogPath from config or environment
	snykLogPath := cfg.SnykLogPath
	if snykLogPath == "" {
		snykLogPath = internal.GetEnv("SNYK_LOG_PATH")
	}

	// If orgsData is a relative path and snykLogPath is set, prepend snykLogPath
	orgsDataPath := *orgsData
	if snykLogPath != "" && !filepath.IsAbs(orgsDataPath) {
		orgsDataPath = filepath.Join(snykLogPath, orgsDataPath)
	}

	// orgs data will be validated and read by GenerateImportTargets

	// Delegate parsing and target generation to GenerateImportTargets which
	// accepts multiple orgs file shapes (orgs array, orgs object, orgData shape).
	targets, err := internal.GenerateImportTargetsWithLogPath(ctx, orgsDataPath, *source, snykLogPath)
	if err != nil {
		logging.Errorf("Failed to generate import targets: %v", err)
		return
	}

	// Get the base directory for output files (not needed currently)

	// Generate the output file path (set below based on source)
	var outputFile string

	// If --integrationID is set, override integrationID for all targets
	if *integrationID != "" {
		for i := range targets {
			targets[i].IntegrationID = *integrationID
		}
	} else {
		logging.Warnf("--integrationID not provided. Import and sync may not work correctly without it.")
	}
	switch *source {
	case "bitbucket-cloud-app":
		outputFile = "bitbucket-cloud-app-import-targets.json"
	case "bitbucket-cloud":
		outputFile = "bitbucket-cloud-import-targets.json"
	case "github", "github-com":
		outputFile = "github-import-targets.json"
	case "github-cloud-app":
		outputFile = "github-cloud-app-import-targets.json"
	case "github-enterprise":
		outputFile = "github-enterprise-import-targets.json"
	case "gitlab":
		outputFile = "gitlab-import-targets.json"
	case "azure-repos":
		outputFile = "azure-repos-import-targets.json"
	case "bitbucket-server":
		outputFile = "bitbucket-server-import-targets.json"
	default:
		outputFile = "import-targets.json"
	}
	var outFilePath string
	if snykLogPath != "" {
		outFilePath = filepath.Join(snykLogPath, outputFile)
	} else {
		outFilePath = outputFile
	}
	resolvedOut, err := internal.ResolveSafePathWithLogPath(outFilePath, snykLogPath)
	if err != nil {
		logging.Errorf("output path rejected: %v", err)
		return
	}
	// marshal to pretty JSON and write via OutputDestination to improve testability
	output := map[string]interface{}{"targets": targets}
	b, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		logging.Errorf("Failed to marshal import targets: %v", err)
		return
	}
	odi := utils.NewOutputDestination()
	if err := odi.WriteFile(resolvedOut, b, 0600); err != nil {
		logging.Errorf("Failed to write import targets file: %v", err)
		return
	}
	logging.Infof("Import targets written to %s", outFilePath)
}
