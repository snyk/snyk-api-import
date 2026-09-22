package cmd

import (
	"context"
	"flag"
	"os"

	"github.com/snyk/snyk-api-import/internal"
	"github.com/snyk/snyk-api-import/internal/logging"
)

// AssetImportCmd reads Snyk Asset Inventory tags, creates any destination
// Organization that doesn't exist yet, and bulk-imports each tagged
// repository that isn't imported yet. GitHub only (see docs/asset-import-api-findings.md).
//
// It talks only to Snyk: reads from the Assets/Orgs APIs and writes Orgs,
// imports, and its own tracking tag (internal.AutoImportedTagKey) back to
// Snyk. It never calls an SCM directly.
func AssetImportCmd(ctx context.Context, cfg internal.AppConfig) {
	fs := flag.NewFlagSet("asset-import", flag.ExitOnError)
	groupID := fs.String("groupId", "", "Snyk group ID (required)")
	tagKey := fs.String("tagKey", internal.DestinationOrgTagKey, "Tag key whose value names the destination Snyk Organization")
	integrationType := fs.String("integrationType", "", "Restrict to/disambiguate a specific integration type, e.g. github-enterprise")
	dryRun := fs.Bool("dryRun", false, "Compute and print the full delta without creating or importing anything")
	exclusionGlobs := fs.String("exclusionGlobs", "", "Comma-separated list of glob patterns to exclude from each import")
	branch := fs.String("branch", "", "Override the branch to import (defaults to each repository's default branch)")
	if err := fs.Parse(os.Args[2:]); err != nil {
		logging.Errorf("Error parsing flags: %v", err)
		return
	}

	if *groupID == "" {
		*groupID = os.Getenv("SNYK_GROUP_ID")
	}
	if *groupID == "" {
		logging.ValidationErrorf("--groupId is required (or set SNYK_GROUP_ID)")
		return
	}

	var globs []string
	if *exclusionGlobs != "" {
		for _, g := range splitAndTrim(*exclusionGlobs) {
			if g != "" {
				globs = append(globs, g)
			}
		}
	}

	opts := internal.AssetImportOptions{
		GroupID:         *groupID,
		TagKey:          *tagKey,
		IntegrationType: *integrationType,
		DryRun:          *dryRun,
		ExclusionGlobs:  globs,
		BranchOverride:  *branch,
	}

	report, err := internal.RunAssetImport(ctx, opts)
	if err != nil {
		logging.Errorf("asset-import failed: %v", err)
		os.Exit(1)
	}

	printAssetImportReport(report)
}

func printAssetImportReport(r *internal.AssetImportReport) {
	label := "Asset import"
	if r.DryRun {
		label = "Asset import (dry-run)"
	}
	logging.Infof("%s: %d org(s) created, %d org(s) already existed, %d repo(s) imported",
		label, len(r.OrgsCreated), len(r.OrgsExisting), len(r.Imported))

	if len(r.OrgsCreated) > 0 {
		logging.Infof("Organizations created:")
		for _, o := range r.OrgsCreated {
			logging.Infof("  - %s", o)
		}
	}
	if len(r.Imported) > 0 {
		logging.Infof("Repositories imported:")
		for _, i := range r.Imported {
			logging.Infof("  - %s", i)
		}
	}
	for reason, items := range r.Skipped {
		logging.Infof("Skipped (%s): %d", reason, len(items))
		for _, item := range items {
			logging.Debugf("  - %s", item)
		}
	}
	if len(r.ImportErrors) > 0 {
		logging.Errorf("Errors:")
		for _, e := range r.ImportErrors {
			logging.Errorf("  - %s", e)
		}
	}
}
