package internal

import "strings"

// This file mirrors the tag grammar and well-known tag keys defined in
// snyk-labs/asset-tagger's internal/tag/tag.go. That package is the source of
// truth for DestinationOrgTagKey, ExcludeTagValue, GitLabProjectIDTagKey, the
// length limits, and the character grammar: asset-tagger writes these values,
// asset-import only reads them. Do not change any of these without updating
// asset-tagger too, and telling the person who owns both.
//
// AutoImportedTagKey is the one exception: it belongs to asset-import alone.
// asset-tagger never reads or writes it, and per its reconcile.go doc comment
// ("Tags under any other key are left exactly as they were, whether an
// operator set them, another tool did, or an earlier run used a different
// key"), asset-tagger reconciliation is confirmed not to touch or clear keys
// it doesn't itself resolve, so this tag survives later asset-tagger runs.
const (
	// DestinationOrgTagKey is the tag key whose value names the destination
	// Snyk Organization for a repository asset. Settled empirically in Phase 0
	// against snyk-labs/asset-tagger's source: __application__ is the former
	// default, superseded by this one.
	DestinationOrgTagKey = "__snyk_destination_org__"

	// ExcludeTagValue marks an asset as deliberately out of import scope,
	// distinct from an absent tag (which usually means nobody got to it).
	// Two underscores each side, not three.
	ExcludeTagValue = "__exclude__"

	// GitLabProjectIDTagKey holds the numeric GitLab project ID asset-tagger
	// resolves, since the Assets API doesn't expose it. Unused while this
	// tool is GitHub-only; kept here as the documented seam for when GitLab
	// support is added.
	GitLabProjectIDTagKey = "__gitlab_project_id__"

	// AutoImportedTagKey is written by asset-import itself, immediately after
	// a confirmed-successful bulk import, with the same value currently held
	// in DestinationOrgTagKey. It replaces a dependency on the Assets API for
	// "already imported" state, which Phase 0 found unreliable: the
	// `organizations` attribute, the `projects` relationship, and the
	// org-scoped assets endpoint were all empty/404 for a repo confirmed
	// imported moments earlier. Comparing this tag's value against the
	// current DestinationOrgTagKey value also doubles as the "moved to a
	// different Org" drift check the spec wanted, without needing any
	// Assets API field for it.
	AutoImportedTagKey = "__snyk_auto_imported__"

	// MaxTagKeyLength is the longest tag key the Assets API accepts.
	// Confirmed live in Phase 0 via the search endpoint's own schema
	// validation error for the `tags.{tagName}` filter pattern.
	MaxTagKeyLength = 30

	// MaxTagValueLength is the longest tag value the Assets API accepts.
	// From asset-tagger's own live-tested constant; not independently
	// re-verified against a write in this codebase beyond the one Phase 0
	// spike PATCH (which used a short value).
	MaxTagValueLength = 40

	// tagValueSymbols are the non-alphanumeric characters a tag value may
	// contain, confirmed by the same schema error.
	tagValueSymbols = "_/:?#@&=+%~-"
)

// ValidTagKey reports whether s satisfies the tag key grammar: at most
// MaxTagKeyLength characters, drawn from alphanumerics, underscores, and
// hyphens.
func ValidTagKey(s string) bool {
	if s == "" || len(s) > MaxTagKeyLength {
		return false
	}
	for _, r := range s {
		if !isAlphanumeric(r) && r != '_' && r != '-' {
			return false
		}
	}
	return true
}

// ValidTagValue reports whether s satisfies the tag value grammar: at most
// MaxTagValueLength characters, drawn from alphanumerics and the symbols
// _ / : ? # @ & = + % ~ -
func ValidTagValue(s string) bool {
	if s == "" || len(s) > MaxTagValueLength {
		return false
	}
	for _, r := range s {
		if !isAlphanumeric(r) && !strings.ContainsRune(tagValueSymbols, r) {
			return false
		}
	}
	return true
}

func isAlphanumeric(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}
