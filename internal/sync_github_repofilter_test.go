package internal

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewRepoFilter(t *testing.T) {
	tests := []struct {
		name  string
		input []string
		want  map[string]bool
	}{
		{
			name:  "nil input means no filtering",
			input: nil,
			want:  nil,
		},
		{
			name:  "empty slice means no filtering",
			input: []string{},
			want:  nil,
		},
		{
			name:  "only blank entries means no filtering",
			input: []string{"", "   ", "\t"},
			want:  nil,
		},
		{
			name:  "names are trimmed and lowercased",
			input: []string{" MyRepo ", "Other-Repo"},
			want:  map[string]bool{"myrepo": true, "other-repo": true},
		},
		{
			name:  "blank entries are dropped alongside real ones",
			input: []string{"repo-a", "", "repo-b"},
			want:  map[string]bool{"repo-a": true, "repo-b": true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, newRepoFilter(tt.input))
		})
	}
}

func TestFilterSnykProjectsByRepo(t *testing.T) {
	projects := []map[string]interface{}{
		{"name": "my-org/keep-me:package.json"},
		{"name": "my-org/drop-me:package.json"},
		{"name": "my-org/KEEP-ME:go.mod"}, // same repo, different manifest and case
		{"name": "keep-me"},               // no owner prefix
		{"name": "my-org/keep-me"},        // no manifest suffix
		{"name": "other-org/drop-me:pom.xml"},
	}

	t.Run("nil filter is a passthrough", func(t *testing.T) {
		got := filterSnykProjectsByRepo(projects, nil)
		assert.Len(t, got, len(projects))
	})

	t.Run("filters to the named repo across manifests and casing", func(t *testing.T) {
		got := filterSnykProjectsByRepo(projects, newRepoFilter([]string{"keep-me"}))

		names := make([]string, 0, len(got))
		for _, p := range got {
			names = append(names, p["name"].(string))
		}

		assert.ElementsMatch(t, []string{
			"my-org/keep-me:package.json",
			"my-org/KEEP-ME:go.mod",
			"keep-me",
			"my-org/keep-me",
		}, names)
	})

	t.Run("no matches yields an empty, non-nil slice", func(t *testing.T) {
		got := filterSnykProjectsByRepo(projects, newRepoFilter([]string{"absent"}))
		assert.NotNil(t, got)
		assert.Empty(t, got)
	})
}

// TestFilterSnykProjectsByRepo_SymmetryWithCompareStates guards the safety
// property behind filtering both sides of the sync comparison: if only the
// source side were narrowed, CompareStates would report the remaining Snyk
// projects as stale and a non-dry-run would deactivate them.
func TestFilterSnykProjectsByRepo_SymmetryWithCompareStates(t *testing.T) {
	manifestTypes := getDefaultManifestTypes()

	// Shape matches what FetchSnykProjects produces: name, branch and a separate
	// manifest field.
	snykProjects := []map[string]interface{}{
		{"name": "my-org/target-repo:package.json", "branch": "main", "manifest": "package.json"},
		{"name": "my-org/unrelated-repo:package.json", "branch": "main", "manifest": "package.json"},
	}

	// Discovery restricted to target-repo only.
	sourceRepos := []map[string]interface{}{
		{"owner": "my-org", "name": "target-repo", "branch": "main", "manifest": "package.json"},
	}

	// Without filtering the Snyk side, unrelated-repo looks stale.
	unfiltered := CompareStates(snykProjects, sourceRepos, manifestTypes)
	assert.Len(t, unfiltered.Stale, 1, "unfiltered comparison should flag the unrelated project as stale")

	// With both sides scoped to the same repo, nothing is stale.
	repoSet := newRepoFilter([]string{"target-repo"})
	filtered := CompareStates(filterSnykProjectsByRepo(snykProjects, repoSet), sourceRepos, manifestTypes)
	assert.Empty(t, filtered.Stale, "scoping both sides should not flag anything as stale")
}
