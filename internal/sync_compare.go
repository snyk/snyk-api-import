package internal

import (
	"strings"

	"github.com/bmatcuk/doublestar/v4"
)

// CompareStates compares source control and Snyk states and returns a CompareResult.
// Missing: items present in source control but not in Snyk (manifest-aware)
// Stale: items present in Snyk but not in source control
// ImportableEmpty: subset of missing where manifest == "" (empty manifest repos)
// BranchUpdates: items where the default branch changed in source control
func CompareStates(snykProjects, sourceRepos []map[string]interface{}, manifestTypes []string) CompareResult {
	var missing, stale, importableEmpty []map[string]interface{}
	var branchUpdates []BranchUpdate
	// Key structure for set comparison
	type key struct {
		owner    string
		repo     string
		branch   string
		manifest string
	}
	snykSet := make(map[key]bool)
	sourceSet := make(map[key]bool)
	snykLookup := make(map[key]map[string]interface{})
	sourceLookup := make(map[key]map[string]interface{})

	// --- Snyk normalization ---
	Logger.Info("Normalized Snyk keys:")
	for _, p := range snykProjects {
		name, _ := p["name"].(string)
		branch, _ := p["branch"].(string)
		manifestField, _ := p["manifest"].(string)
		// Branch normalization: use Snyk project branch field directly, only default to 'main' if both Snyk and source are empty
		if trRaw, ok := p["targetReference"]; ok {
			if tr, ok := trRaw.(string); ok && tr != "" {
				branch = tr
			}
		}
		// Owner/repo normalization: parse from Snyk project name
		owner := ""
		repo := ""
		if strings.Contains(name, "/") {
			repoPart := strings.SplitN(name, ":", 2)[0]
			parts := strings.SplitN(repoPart, "/", 2)
			if len(parts) == 2 {
				owner = parts[0]
				repo = parts[1]
			} else {
				repo = repoPart
			}
		} else {
			repo = name
		}
		// Normalize owner and repo to lowercase for case-insensitive comparison
		// (Source control uses various cases: GitHub lowercase, Bitbucket Server uppercase keys)
		owner = strings.ToLower(owner)
		repo = strings.ToLower(repo)
		// Only force owner if Snyk project name is missing owner and source control owner is known
		if owner == "" && len(sourceRepos) > 0 {
			knownOwner, _ := sourceRepos[0]["owner"].(string)
			if knownOwner != "" {
				owner = strings.ToLower(knownOwner)
			}
		}
		if branch == "" {
			branch = "main"
		}
		// Manifest extraction: always use relative path (after ':') and filter by manifestTypes
		manifests := []string{}
		if manifestField != "" {
			for _, mf := range strings.Split(manifestField, ",") {
				mf = strings.TrimSpace(mf)
				// If manifest contains ':', use part after ':'
				if strings.Contains(mf, ":") {
					mf = strings.SplitN(mf, ":", 2)[1]
				}
				if len(manifestTypes) > 0 {
					matched := false
					for _, mt := range manifestTypes {
						matchPath, _ := doublestar.Match(mt, mf)
						filename := mf
						if idx := strings.LastIndex(mf, "/"); idx != -1 {
							filename = mf[idx+1:]
						}
						matchFile, _ := doublestar.Match(mt, filename)
						if matchPath || matchFile || mf == mt || filename == mt {
							matched = true
							break
						}
					}
					if !matched {
						continue
					}
				}
				manifests = append(manifests, mf)
			}
		}
		if len(manifests) == 0 {
			k := key{owner: owner, repo: repo, branch: branch, manifest: ""}
			snykSet[k] = true
			if _, ok := snykLookup[k]; !ok {
				snykLookup[k] = p
			}
			Logger.Infof("  Snyk: owner=%q repo=%q branch=%q manifest=%q", k.owner, k.repo, k.branch, k.manifest)
		} else {
			for _, manifest := range manifests {
				k := key{owner: owner, repo: repo, branch: branch, manifest: manifest}
				snykSet[k] = true
				if _, ok := snykLookup[k]; !ok {
					snykLookup[k] = p
				}
				Logger.Infof("  Snyk: owner=%q repo=%q branch=%q manifest=%q", k.owner, k.repo, k.branch, k.manifest)
			}
		}
	}

	// --- Source control normalization ---
	Logger.Info("Normalized source control keys (default branch only):")
	// Print all normalized keys for Snyk and source control before set comparison
	// Note: individual Snyk/source control keys are logged during normalization above.
	// Avoid re-printing the same lists here to prevent duplicate debug output.
	for _, r := range sourceRepos {
		repo, _ := r["name"].(string)
		owner, _ := r["owner"].(string)
		branch, _ := r["branch"].(string)
		manifestField, _ := r["manifest"].(string)
		// Normalize owner and repo to lowercase for case-insensitive comparison
		owner = strings.ToLower(owner)
		repo = strings.ToLower(repo)
		manifests := []string{}
		if manifestField != "" {
			for _, mf := range strings.Split(manifestField, ",") {
				mf = strings.TrimSpace(mf)
				if len(manifestTypes) > 0 {
					matched := false
					for _, mt := range manifestTypes {
						matchPath, _ := doublestar.Match(mt, mf)
						filename := mf
						if idx := strings.LastIndex(mf, "/"); idx != -1 {
							filename = mf[idx+1:]
						}
						matchFile, _ := doublestar.Match(mt, filename)
						if matchPath || matchFile || mf == mt || filename == mt {
							matched = true
							break
						}
					}
					if !matched {
						continue
					}
				}
				manifests = append(manifests, mf)
			}
		}
		if len(manifests) == 0 {
			k := key{owner: owner, repo: repo, branch: branch, manifest: ""}
			sourceSet[k] = true
			if _, ok := sourceLookup[k]; !ok {
				sourceLookup[k] = r
			}
			Logger.Infof("  Source: owner=%q repo=%q branch=%q manifest=%q", k.owner, k.repo, k.branch, k.manifest)
		} else {
			for _, manifest := range manifests {
				k := key{owner: owner, repo: repo, branch: branch, manifest: manifest}
				sourceSet[k] = true
				if _, ok := sourceLookup[k]; !ok {
					sourceLookup[k] = r
				}
				Logger.Infof("  Source: owner=%q repo=%q branch=%q manifest=%q", k.owner, k.repo, k.branch, k.manifest)
			}
		}
	}

	// --- Set comparison ---
	// Find missing (in source but not in Snyk)
	for k := range sourceSet {
		if !snykSet[k] {
			// Check if this repo+manifest exists in Snyk on a different branch
			// If so, this is a branch change - add to BranchUpdates
			branchMismatch := false
			var oldSnykKey key
			for snykKey := range snykSet {
				if snykKey.owner == k.owner && snykKey.repo == k.repo && snykKey.manifest == k.manifest && snykKey.branch != k.branch {
					Logger.Debugf("Branch change detected for %s/%s:%s - Snyk has branch '%s', source has branch '%s'", k.owner, k.repo, k.manifest, snykKey.branch, k.branch)
					branchMismatch = true
					oldSnykKey = snykKey
					break
				}
			}
			if branchMismatch {
				// Add to branch updates
				branchUpdates = append(branchUpdates, BranchUpdate{
					OldSnykProject: snykLookup[oldSnykKey],
					NewSourceRepo:  sourceLookup[k],
					OldBranch:      oldSnykKey.branch,
					NewBranch:      k.branch,
				})
				// Don't add to missing - branch updates are handled separately
				// Fallback to deactivate+import is handled manually in sync functions when PATCH fails
				continue
			}

			item := sourceLookup[k]
			if k.manifest == "" {
				importableEmpty = append(importableEmpty, item)
			} else {
				missing = append(missing, item)
			}
		}
	}
	// Find stale (in Snyk but not in source)
	for k := range snykSet {
		if !sourceSet[k] {
			// Check if this repo+manifest exists in source on a different branch
			// If so, skip it (don't mark as stale - just a branch change)
			branchMismatch := false
			for sourceKey := range sourceSet {
				if sourceKey.owner == k.owner && sourceKey.repo == k.repo && sourceKey.manifest == k.manifest && sourceKey.branch != k.branch {
					Logger.Debugf("Skipping deactivation for %s/%s@%s:%s - exists in source on branch %s (likely default branch change)", k.owner, k.repo, k.branch, k.manifest, sourceKey.branch)
					branchMismatch = true
					break
				}
			}
			if branchMismatch {
				// Don't mark as stale - branch updates are handled separately via PATCH
				// Fallback to deactivate+import is handled manually in sync functions when PATCH fails
				continue
			}

			// If manifest is empty, check for any source repo with same owner/repo/branch and manifest=""
			if k.manifest == "" {
				found := false
				for bk := range sourceSet {
					if bk.owner == k.owner && bk.repo == k.repo && bk.branch == k.branch && bk.manifest == "" {
						found = true
						break
					}
				}
				if found {
					continue // treat as matched
				}
			}
			stale = append(stale, snykLookup[k])
		}
	}
	return CompareResult{Missing: missing, Stale: stale, ImportableEmpty: importableEmpty, BranchUpdates: branchUpdates}
}
