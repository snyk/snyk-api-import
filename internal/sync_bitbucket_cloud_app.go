package internal

import (
	"context"
)

// SyncBitbucketCloudApp performs sync for Bitbucket Cloud App using API-first manifest discovery.
// This is a thin wrapper around SyncBitbucketCloudUnified that enforces the "bitbucket-cloud-app" source.
func SyncBitbucketCloudApp(ctx context.Context, groupID, orgsFile, targetsFile string, dryRun bool, snykLogPath string, enableBranchUpdateFallback bool, useCache bool) error {
	// Note: groupID parameter is kept for backward compatibility but maps to orgID internally
	return SyncBitbucketCloudUnified(ctx, "bitbucket-cloud-app", groupID, orgsFile, targetsFile, dryRun, snykLogPath, enableBranchUpdateFallback, useCache)
}

// performBitbucketCloudAppImports imports each missing manifest into Snyk (per-file + exclusions).
func performBitbucketCloudAppImports(ctx context.Context, targets []map[string]interface{}, orgID, integrationID string) error {
	results, err := ParallelImportSyncMaps(ctx, targets, orgID, integrationID, "bitbucket-cloud-app")
	if err != nil {
		return err
	}
	imported, failed, skipped := results.GetCounts()
	Logger.Infof("Bitbucket Cloud App import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)
	return nil
}
