package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/snyk/snyk-api-import/cmd"
	"github.com/snyk/snyk-api-import/internal"
	"github.com/snyk/snyk-api-import/internal/buildinfo"
	"github.com/snyk/snyk-api-import/internal/logging"
)

func main() {
	// Handle version flag before any other setup
	if len(os.Args) > 1 && (os.Args[1] == "version" || os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Printf("snyk-api-import %s\n", buildinfo.Version)
		fmt.Printf("Git Commit: %s\n", buildinfo.GitCommit)
		fmt.Printf("Build Date: %s\n", buildinfo.BuildDate)
		os.Exit(0)
	}

	cmd.RunWithLifecycle(func(ctx context.Context) {
		// Parse global --config flag if present (can be anywhere in args)
		// and filter it out from os.Args so commands don't see it
		var configFile string
		var filteredArgs []string
		skipNext := false

		for i, arg := range os.Args {
			if skipNext {
				skipNext = false
				continue
			}

			// Handle --config=path
			if strings.HasPrefix(arg, "--config=") {
				configFile = strings.TrimPrefix(arg, "--config=")
				continue // Skip this arg
			}

			// Handle --config path
			if arg == "--config" && i+1 < len(os.Args) {
				configFile = os.Args[i+1]
				skipNext = true
				continue // Skip this arg
			}

			filteredArgs = append(filteredArgs, arg)
		}

		// Replace os.Args with filtered args (without --config)
		os.Args = filteredArgs

		// Try to load TOML config first
		tomlConfig, err := internal.LoadTOMLConfig(configFile)
		if err != nil {
			// If user explicitly specified a config file that failed to load, that's an error
			if configFile != "" {
				logging.Errorf("Failed to load config file: %v", err)
				os.Exit(1)
			}
			// Otherwise, just log a debug message and continue with environment variables
			logging.Debugf("No config file found, using environment variables: %v", err)
		}

		// If we have a TOML config, merge with environment variables and apply to environment
		if tomlConfig != nil {
			// Merge with environment variables (env vars take precedence)
			tomlConfig.MergeWithEnv()

			// Apply config to environment so existing code continues to work
			tomlConfig.ApplyToEnvironment()

			// Set global config so commands can use it
			internal.SetGlobalTOMLConfig(tomlConfig)
		}

		// Load AppConfig (now enriched with TOML values if config file was found)
		cfg := internal.LoadAppConfigFromEnv()

		// Configure logging from the typed AppConfig (e.g., write logs to SNYK_LOG_PATH)
		if err := logging.ConfigureFromAppConfig(cfg); err != nil {
			// If file logging cannot be configured, continue but emit a warning.
			logging.Warnf("failed to configure file logging: %v", err)
		}
		if cfg.SnykLogPath == "" {
			logging.Errorf("Logging path is not configured. Please set SNYK_LOG_PATH in your environment (e.g. 'export SNYK_LOG_PATH=./logs') or configure 'logging.path' in your config.toml file.")
			os.Exit(1)
		}
		if len(os.Args) < 2 || os.Args[1] == "--help" || os.Args[1] == "help" {
			logging.Infof("Usage: snyk-api-import <command> [flags]")
			logging.Infof("")
			logging.Infof("Global Flags:")
			logging.Infof("  --config <path>    Path to config.toml file (optional)")
			logging.Infof("                     Auto-searches: ./config.toml, $SNYK_LOG_PATH/config.toml,")
			logging.Infof("                     ~/.snyk-api-import/config.toml, /etc/snyk-api-import/config.toml")
			logging.Infof("")
			logging.Infof("Commands:")
			logging.Infof("")
			logging.Infof("  orgs:data      --source <scm> [--groupId <id>] [--sourceOrgPublicId <org>]")
			logging.Infof("      Generates Snyk org data from SCM organizations/groups.")
			logging.Infof("      Output: <source>-orgs.json in $SNYK_LOG_PATH")
			logging.Infof("")
			logging.Infof("  orgs:create    --file <orgs-file> [--noDuplicateNames] [--includeExistingOrgsInOutput]")
			logging.Infof("      Creates Snyk organizations from a file.")
			logging.Infof("      Output: snyk-created-orgs.json in $SNYK_LOG_PATH")
			logging.Infof("")
			logging.Infof("  import:data    --orgsData <orgs-file> --source <scm> [--integrationId <id>]")
			logging.Infof("      Generates import targets from orgs data.")
			logging.Infof("      Output: <source>-import-targets.json in $SNYK_LOG_PATH")
			logging.Infof("")
			logging.Infof("  import         --file <targets-file> [--integrationId <id>]")
			logging.Infof("      Imports projects into Snyk from a targets file.")
			logging.Infof("      Output: imported-targets.json, failed-to-poll.json in $SNYK_LOG_PATH")
			logging.Infof("")
			logging.Infof("  sync           --source <scm> --orgPublicId <id> [--dryRun]")
			logging.Infof("      Syncs Snyk projects with SCM repositories.")
			logging.Infof("      Auto-discovers integration ID and uses <source>-import-targets.json from $SNYK_LOG_PATH")
			logging.Infof("      Use --dryRun to preview actions without making changes.")
			logging.Infof("")
			logging.Infof("  list:imported  --integrationType <type> [--groupId <id> | --orgId <id>]")
			logging.Infof("      Lists imported projects from Snyk.")
			logging.Infof("      Output: <source>-imported-targets.json in $SNYK_LOG_PATH")
			logging.Infof("")
			logging.Infof("Important Notes:")
			logging.Infof("  • sync command auto-detects integration IDs - no manual lookup needed")
			logging.Infof("  • import:data can work without --integrationId if the integration is installed")
			logging.Infof("  • All commands respect config.toml settings (see config.toml.example)")
			logging.Infof("  • Environment variables override config.toml, CLI flags override both")
			logging.Infof("")
			logging.Infof("Typical Workflow:")
			logging.Infof("  1. snyk-api-import orgs:data --source github --groupId <id>")
			logging.Infof("  2. snyk-api-import orgs:create --file github-orgs.json")
			logging.Infof("  3. snyk-api-import import:data --orgsData snyk-created-orgs.json --source github")
			logging.Infof("  4. snyk-api-import import --file github-import-targets.json")
			logging.Infof("  Or use: snyk-api-import sync --source github --orgPublicId <id> [--dryRun]")
			logging.Infof("")
			logging.Infof("For detailed configuration options, see: config.toml.example")
			os.Exit(0)
		}
		switch os.Args[1] {
		case "import":
			// Forward CLI flags to ImportCmd
			os.Args = append([]string{os.Args[0]}, os.Args[2:]...)
			cmd.ImportCmd(ctx, cfg)
		case "orgs:data":
			cmd.OrgsDataCmd(ctx, cfg)
		case "orgs:create":
			cmd.OrgsCreateCmd(ctx, cfg)
		case "import:data":
			cmd.ImportDataCmd(ctx, cfg)
		case "sync":
			cmd.SyncCmd(ctx, cfg)
		case "list:imported":
			cmd.ListImportedCmd(ctx, cfg)
		default:
			logging.Errorf("Unknown command: %s", os.Args[1])
			os.Exit(1)
		}
	})
}
