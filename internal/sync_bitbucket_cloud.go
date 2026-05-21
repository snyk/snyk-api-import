package internal

import (
	"context"
	"fmt"
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

// performBitbucketCloudImports imports each missing manifest into Snyk (per-file + exclusions).
func performBitbucketCloudImports(ctx context.Context, targets []map[string]interface{}, orgID, integrationID string) error {
	results, err := ParallelImportSyncMaps(ctx, targets, orgID, integrationID, "bitbucket-cloud")
	if err != nil {
		return fmt.Errorf("parallel import: %w", err)
	}
	imported, failed, skipped := results.GetCounts()
	Logger.Infof("Bitbucket Cloud import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
	return nil
}
