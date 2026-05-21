package internal

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// ParallelImportSyncMaps imports sync comparison "missing" entries (one Snyk API call per manifest).
// Each entry must include a manifest path; sends files[] and merged exclusionGlobs per upstream importSingleTarget.
func ParallelImportSyncMaps(
	ctx context.Context,
	targets []map[string]interface{},
	orgID, integrationID, source string,
) (*ImportResults, error) {
	snykToken := os.Getenv("SNYK_TOKEN")
	if snykToken == "" {
		snykToken = os.Getenv("SNYK_API_TOKEN")
	}
	if snykToken == "" {
		return nil, fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable is required")
	}

	importTargets := BuildImportTargetsFromSyncMaps(source, orgID, integrationID, targets)
	if len(importTargets) == 0 {
		Logger.Infof("No sync import targets to process (empty manifest list)")
		return NewImportResults(), nil
	}

	config := ParallelImportConfig{
		OrgID:         orgID,
		IntegrationID: integrationID,
		Source:        importPayloadSource(source),
		Concurrency:   GetImportConcurrency(0),
		SnykToken:     snykToken,
		PollTimeout:   GetPollTimeout(),
		DryRun:        false,
	}

	Logger.Infof(
		"Starting parallel sync imports (%s): %d manifest(s), concurrency=%d",
		source, len(importTargets), config.Concurrency,
	)

	return ParallelImport(ctx, importTargets, config)
}

// BuildImportTargetsFromSyncMaps converts sync Missing entries into ImportTarget values
// with per-file files[] and merged exclusionGlobs.
func BuildImportTargetsFromSyncMaps(
	source, orgID, integrationID string,
	targets []map[string]interface{},
) []ImportTarget {
	excl := SyncImportExclusionGlobs()
	out := make([]ImportTarget, 0, len(targets))

	for _, t := range targets {
		manifest := manifestPathFromSyncMap(t)
		if manifest == "" {
			Logger.Warnf("Skipping sync import entry with empty manifest: %+v", t)
			continue
		}

		target, ok := buildSyncImportTarget(t, source)
		if !ok {
			Logger.Warnf("Skipping sync import entry with incomplete target: %+v", t)
			continue
		}

		out = append(out, ImportTarget{
			Target:         target,
			OrgID:          orgID,
			IntegrationID:  integrationID,
			Files:          []FilePath{{Path: manifest}},
			ExclusionGlobs: excl,
		})
	}

	return out
}

func buildSyncImportTarget(t map[string]interface{}, source string) (Target, bool) {
	branch, _ := t["branch"].(string)
	if branch == "" {
		branch = "main"
	}

	switch source {
	case "bitbucket-server":
		projectKey := stringFromSyncMap(t, "projectKey")
		repoSlug := stringFromSyncMap(t, "repoSlug")
		if repoSlug == "" {
			repoSlug = stringFromSyncMap(t, "name")
		}
		if projectKey == "" || repoSlug == "" {
			return Target{}, false
		}
		return Target{ProjectKey: projectKey, RepoSlug: repoSlug, Branch: branch}, true

	case "gitlab", "gitlab-enterprise":
		id, ok := intFromSyncMap(t["id"])
		if !ok || id == 0 {
			return Target{}, false
		}
		return Target{
			ID:     id,
			Branch: branch,
			Name:   stringFromSyncMap(t, "name"),
			Owner:  stringFromSyncMap(t, "owner"),
		}, true

	default:
		name := stringFromSyncMap(t, "name")
		owner := stringFromSyncMap(t, "owner")
		if name == "" || owner == "" {
			return Target{}, false
		}
		return Target{Name: name, Owner: owner, Branch: branch}, true
	}
}

func manifestPathFromSyncMap(t map[string]interface{}) string {
	m := stringFromSyncMap(t, "manifest")
	if m == "<nil>" {
		return ""
	}
	return m
}

func stringFromSyncMap(t map[string]interface{}, key string) string {
	v, ok := t[key]
	if !ok || v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", v))
}

func intFromSyncMap(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}

func importPayloadSource(source string) string {
	switch source {
	case "github-com":
		return "github"
	case "github-cloud-app":
		return "github"
	case "github-enterprise":
		return "github-enterprise"
	case "gitlab-enterprise":
		return "gitlab"
	case "bitbucket-cloud-app":
		return "bitbucket-cloud"
	default:
		return source
	}
}
