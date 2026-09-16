package internal

import (
	"os"
	"strings"
)

// DefaultExclusionGlobs matches upstream TypeScript src/common.ts defaultExclusionGlobs.
func DefaultExclusionGlobs() []string {
	return []string{
		"fixtures", "tests", "__tests__", "test", "__test__",
		"ci", "node_modules", "bower_components", ".git",
	}
}

// SyncImportExclusionGlobs returns merged user + default exclusions for sync-driven Snyk imports.
// Matches upstream importSingleTarget (always sends exclusionGlobs on sync re-import).
func SyncImportExclusionGlobs() *string {
	s := MergeExclusionGlobs(GetExclusionGlobs(), DefaultExclusionGlobs())
	return &s
}

// MergeExclusionGlobs returns a comma-separated exclusion list for sync imports only
// (user globs first, then defaults), deduplicating empty segments.
func MergeExclusionGlobs(user []string, defaults []string) string {
	seen := make(map[string]struct{})
	var parts []string
	appendUnique := func(items []string) {
		for _, g := range items {
			g = strings.TrimSpace(g)
			if g == "" {
				continue
			}
			if _, ok := seen[g]; ok {
				continue
			}
			seen[g] = struct{}{}
			parts = append(parts, g)
		}
	}
	appendUnique(user)
	appendUnique(defaults)
	return strings.Join(parts, ",")
}

// IsSafeGlob rejects patterns that commonly trigger ReDoS in regex-backed glob engines.
// Matches upstream clone-and-analyze isSafeGlob validation.
func IsSafeGlob(glob string) bool {
	if glob == "" {
		return false
	}
	if len(glob) > 128 {
		return false
	}
	for _, r := range glob {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '*', r == '?', r == '.', r == '/':
		default:
			return false
		}
	}
	return !strings.Contains(glob, "***")
}

// GetExclusionGlobs returns user-configured exclusion patterns for sync discovery.
// Resolution order: EXCLUSION_GLOBS env (from sync --exclusionGlobs) → config.toml [import] exclusion_globs → [].
// Unsafe patterns are dropped with a warning (ReDoS guard).
func GetExclusionGlobs() []string {
	if v := strings.TrimSpace(os.Getenv("EXCLUSION_GLOBS")); v != "" {
		return filterSafeExclusionGlobs(parseCommaSeparatedGlobs(v))
	}
	if cfg := GetGlobalTOMLConfig(); cfg != nil && len(cfg.Import.ExclusionGlobs) > 0 {
		return filterSafeExclusionGlobs(cfg.Import.ExclusionGlobs)
	}
	return nil
}

// DiscoveryExclusionGlobs returns globs applied during sync manifest discovery (defaults + user).
// Matches upstream clone-and-analyze: [...defaultExclusionGlobs, ...exclusionGlobs].
func DiscoveryExclusionGlobs() []string {
	return append(DefaultExclusionGlobs(), GetExclusionGlobs()...)
}

// PathExcludedByDiscovery reports whether a repo file path should be skipped during discovery.
// Uses substring matching on a lowercased path, matching TypeScript file.includes(glob) behavior.
func PathExcludedByDiscovery(path string, globs []string) bool {
	lower := strings.ToLower(path)
	for _, g := range globs {
		g = strings.TrimSpace(g)
		if g == "" {
			continue
		}
		if strings.Contains(lower, strings.ToLower(g)) {
			return true
		}
	}
	return false
}

func parseCommaSeparatedGlobs(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func filterSafeExclusionGlobs(globs []string) []string {
	var out []string
	for _, g := range globs {
		g = strings.TrimSpace(g)
		if g == "" {
			continue
		}
		if IsSafeGlob(g) {
			out = append(out, g)
		} else {
			Logger.Warnf("Skipping unsafe exclusion glob: %s", g)
		}
	}
	return out
}
