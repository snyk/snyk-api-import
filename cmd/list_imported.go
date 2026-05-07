package cmd

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"strings"

	"github.com/sam1el/snyk-api-import-go/internal"
	"github.com/sam1el/snyk-api-import-go/internal/logging"
	"github.com/sam1el/snyk-api-import-go/internal/security"
	"github.com/sam1el/snyk-api-import-go/internal/utils"
)

// ListImportedCmd lists all imported targets for a group and source type
func ListImportedCmd(ctx context.Context, cfg internal.AppConfig) {
	fs := flag.NewFlagSet("list:imported", flag.ExitOnError)
	groupID := fs.String("groupId", "", "Snyk group ID")
	orgID := fs.String("orgId", "", "Snyk org public ID (alternative to --orgsFile)")
	integrationType := fs.String("integrationType", "github", "Integration type (renamed from 'source' for consistency)")
	// Keep deprecated 'source' flag for backward compatibility
	source := fs.String("source", "", "Source type (deprecated, use --integrationType)")
	orgsFile := fs.String("orgsFile", "", "Path to orgs file (JSON) (optional if --orgID provided)")
	outputFile := fs.String("outputFile", "imported-targets.json", "Output file for imported targets")
	if err := fs.Parse(os.Args[2:]); err != nil {
		logging.Errorf("Error parsing flags: %v", err)
		return
	}

	// Handle backward compatibility: if --source is set, use it as integrationType
	if *source != "" {
		*integrationType = *source
		logging.Warnf("--source is deprecated, please use --integrationType instead")
	}

	// Validate integrationType is provided
	if *integrationType == "" {
		logging.ValidationErrorf("--integrationType is required")
		return
	}

	// Apply integration config from TOML based on --integrationType flag
	// This will set environment variables including SNYK_GROUP_ID and ORG_ID
	if err := internal.ApplySourceConfigToEnv(*integrationType); err != nil {
		logging.Debugf("Could not apply integration config for %s: %v", *integrationType, err)
	}

	// If groupID not provided via CLI, try to get it from config.toml
	if *groupID == "" {
		*groupID = os.Getenv("SNYK_GROUP_ID")
		if *groupID != "" {
			logging.Debugf("Using SNYK_GROUP_ID from config.toml: %s", *groupID)
		}
	}

	// Validate groupID and orgID - match TypeScript behavior
	// Either --groupId OR --orgId must be provided (not both)
	if *groupID == "" && *orgID == "" {
		logging.ValidationErrorf("Either --groupId or --orgId must be provided (provide via CLI flag or config.toml)")
		return
	}

	if *groupID != "" && *orgID != "" {
		logging.ValidationErrorf("Provide either --groupId or --orgId, not both")
		return
	}

	// If orgID not provided via CLI, try to get it from config.toml
	if *orgID == "" && *orgsFile == "" && *groupID != "" {
		*orgID = os.Getenv("ORG_ID")
		if *orgID != "" {
			logging.Debugf("Using ORG_ID from config.toml: %s", *orgID)
		}
	}

	// When using --groupId, either orgID or orgsFile must be provided
	if *groupID != "" && *orgID == "" && *orgsFile == "" {
		logging.ValidationErrorf("When using --groupId, either --orgId or --orgsFile must be provided (provide via CLI flag or config.toml)")
		return
	}

	// Determine which orgs to process
	type OrgInfo struct {
		Name        string
		OrgID       string
		SourceOrgID string
	}
	var orgsToProcess []OrgInfo

	if *orgID != "" {
		// Single org specified via --orgID
		orgsToProcess = []OrgInfo{{OrgID: *orgID}}
	} else {
		// Read orgs from file
		resolvedOrg, err := internal.ResolveSafePath(*orgsFile)
		if err != nil {
			logging.Errorf("orgsFile path rejected: %v", err)
			return
		}
		// Inline check: ensure resolvedOrg is inside SNYK_LOG_PATH when set
		logPath := cfg.SnykLogPath
		if logPath == "" {
			logPath = os.Getenv("SNYK_LOG_PATH")
		}
		if logPath != "" {
			absLog, _ := filepath.Abs(logPath)
			absResolved, _ := filepath.Abs(resolvedOrg)
			if absResolved != absLog && !strings.HasPrefix(absResolved, absLog+string(os.PathSeparator)) {
				logging.Errorf("orgsFile path is outside SNYK_LOG_PATH: %s", resolvedOrg)
				return
			}
		} else {
			if filepath.IsAbs(resolvedOrg) {
				logging.Errorf("orgsFile path is absolute while SNYK_LOG_PATH is unset: %s", resolvedOrg)
				return
			}
		}
		// Read orgs file using secure read (enforces ResolveSafePath + size limits)
		orgsData, err := security.SafeReadFile(resolvedOrg, 5<<20)
		if err != nil {
			logging.Errorf("Failed to read orgs file: %v", err)
			return
		}
		var orgs struct {
			Orgs []OrgInfo `json:"orgs"`
		}
		if err := json.Unmarshal(orgsData, &orgs); err != nil {
			logging.Errorf("Failed to unmarshal orgs file: %v", err)
			return
		}
		orgsToProcess = orgs.Orgs
	}

	// For each org, fetch projects from Snyk API
	importedTargets := []map[string]string{}
	for _, org := range orgsToProcess {
		projects, err := internal.ListSnykProjects(org.OrgID)
		if err != nil {
			logging.Errorf("Failed to list projects for org %s: %v", org.OrgID, err)
			continue
		}
		for _, proj := range projects {
			importedTargets = append(importedTargets, map[string]string{
				"orgID":           org.OrgID,
				"projectId":       proj.ProjectID,
				"name":            proj.Name,
				"integrationType": *integrationType,
			})
		}
	}

	// Validate output file path similarly: expand and ensure it's inside SNYK_LOG_PATH if set
	// Resolve output path safely
	var outCandidate string
	logPath2 := cfg.SnykLogPath
	if logPath2 == "" {
		logPath2 = os.Getenv("SNYK_LOG_PATH")
	}
	if logPath2 != "" && !filepath.IsAbs(*outputFile) {
		outCandidate = filepath.Join(logPath2, *outputFile)
	} else {
		outCandidate = *outputFile
	}
	resolvedOut, err := internal.ResolveSafePath(outCandidate)
	if err != nil {
		logging.Errorf("outputFile path rejected: %v", err)
		return
	}
	b, err := json.MarshalIndent(map[string]interface{}{"importedTargets": importedTargets}, "", "  ")
	if err != nil {
		logging.Errorf("Failed to marshal imported targets: %v", err)
		return
	}
	odi := utils.NewOutputDestination()
	if err := odi.WriteFile(resolvedOut, b, 0600); err != nil {
		logging.Errorf("Failed to write output file: %v", err)
		return
	}
	logging.Infof("Imported targets written to %s", *outputFile)
}
