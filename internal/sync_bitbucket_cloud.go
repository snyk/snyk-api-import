package internal

import (
	"context"
	"fmt"
	"os"
)

// SyncBitbucketCloud performs sync for Bitbucket Cloud using API-first manifest discovery
func SyncBitbucketCloud(orgID, source, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool, useCache bool) error {
	ctx := context.Background()
	return SyncBitbucketCloudContext(ctx, orgID, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback, useCache)
}

// SyncBitbucketCloudContext performs sync for Bitbucket Cloud with context support.
// This is a thin wrapper around SyncBitbucketCloudUnified that enforces the "bitbucket-cloud" source.
func SyncBitbucketCloudContext(ctx context.Context, orgID, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool, useCache bool) error {
	return SyncBitbucketCloudUnified(ctx, "bitbucket-cloud", orgID, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback, useCache)
}

// performBitbucketCloudImports executes the actual Snyk import API calls for Bitbucket Cloud targets
func performBitbucketCloudImports(ctx context.Context, targets []map[string]interface{}, orgID, integrationID string) error {
	snykToken := os.Getenv("SNYK_TOKEN")
	if snykToken == "" {
		return fmt.Errorf("SNYK_TOKEN environment variable is required")
	}

	// Convert map targets to ImportTarget structs for ParallelImport
	importTargets := make([]ImportTarget, 0, len(targets))
	for _, t := range targets {
		name, _ := t["name"].(string)
		owner, _ := t["owner"].(string)
		branch, _ := t["branch"].(string)

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
		Source:        "bitbucket-cloud",
		Concurrency:   GetImportConcurrency(0),
		SnykToken:     snykToken,
		PollTimeout:   GetPollTimeout(),
		DryRun:        false,
	}

	Logger.Infof("Starting parallel Bitbucket Cloud imports: %d targets, concurrency=%d", len(importTargets), config.Concurrency)

	results, err := ParallelImport(ctx, importTargets, config)
	if err != nil {
		return fmt.Errorf("parallel import: %w", err)
	}

	// Log summary
	imported, failed, skipped := results.GetCounts()
	Logger.Infof("Bitbucket Cloud import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)

	return nil
}
