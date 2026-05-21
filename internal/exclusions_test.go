package internal

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDefaultExclusionGlobs_MatchesUpstream(t *testing.T) {
	globs := DefaultExclusionGlobs()
	assert.Contains(t, globs, "fixtures")
	assert.Contains(t, globs, "node_modules")
	assert.Contains(t, globs, ".git")
}

func TestMergeExclusionGlobs(t *testing.T) {
	got := MergeExclusionGlobs([]string{"custom", "fixtures"}, DefaultExclusionGlobs())
	assert.Contains(t, got, "custom")
	assert.Contains(t, got, "fixtures")
	assert.Contains(t, got, "node_modules")
}

func TestIsSafeGlob(t *testing.T) {
	assert.True(t, IsSafeGlob("fixtures"))
	assert.True(t, IsSafeGlob("**/test/**"))
	assert.False(t, IsSafeGlob(""))
	assert.False(t, IsSafeGlob(strings.Repeat("a", 129)))
	assert.False(t, IsSafeGlob("bad|glob"))
	assert.False(t, IsSafeGlob("***"))
}
