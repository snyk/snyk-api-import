package internal

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetExclusionGlobs_FromEnv(t *testing.T) {
	oldCfg := GetGlobalTOMLConfig()
	defer func() {
		SetGlobalTOMLConfig(oldCfg)
		os.Unsetenv("EXCLUSION_GLOBS")
	}()

	SetGlobalTOMLConfig(&TOMLConfig{
		Import: ImportConfigTOML{ExclusionGlobs: []string{"from-toml"}},
	})
	os.Setenv("EXCLUSION_GLOBS", "custom-dir,fixtures")

	got := GetExclusionGlobs()
	assert.Equal(t, []string{"custom-dir", "fixtures"}, got)
}

func TestGetExclusionGlobs_FromConfig(t *testing.T) {
	oldCfg := GetGlobalTOMLConfig()
	defer func() {
		SetGlobalTOMLConfig(oldCfg)
		os.Unsetenv("EXCLUSION_GLOBS")
	}()

	os.Unsetenv("EXCLUSION_GLOBS")
	SetGlobalTOMLConfig(&TOMLConfig{
		Import: ImportConfigTOML{ExclusionGlobs: []string{"my-workspace-dir"}},
	})

	got := GetExclusionGlobs()
	assert.Equal(t, []string{"my-workspace-dir"}, got)
}

func TestGetExclusionGlobs_FiltersUnsafe(t *testing.T) {
	oldCfg := GetGlobalTOMLConfig()
	defer func() {
		SetGlobalTOMLConfig(oldCfg)
		os.Unsetenv("EXCLUSION_GLOBS")
	}()

	SetGlobalTOMLConfig(nil)
	os.Setenv("EXCLUSION_GLOBS", "safe-glob,bad|glob")

	got := GetExclusionGlobs()
	assert.Equal(t, []string{"safe-glob"}, got)
}

func TestDiscovery_SkipsExcludedPath(t *testing.T) {
	globs := DiscoveryExclusionGlobs()
	assert.True(t, PathExcludedByDiscovery("src/fixtures/pkg/package.json", globs))
	assert.True(t, PathExcludedByDiscovery("node_modules/foo/bar.js", globs))
	assert.False(t, PathExcludedByDiscovery("src/lib/main.go", globs))
}

func TestDiscovery_SkipsUserGlob(t *testing.T) {
	oldCfg := GetGlobalTOMLConfig()
	defer func() {
		SetGlobalTOMLConfig(oldCfg)
		os.Unsetenv("EXCLUSION_GLOBS")
	}()

	SetGlobalTOMLConfig(nil)
	os.Setenv("EXCLUSION_GLOBS", "my-custom-skip")

	globs := DiscoveryExclusionGlobs()
	assert.True(t, PathExcludedByDiscovery("apps/my-custom-skip/manifest.json", globs))
}

func TestDiscoveryExclusionGlobs_IncludesDefaults(t *testing.T) {
	oldCfg := GetGlobalTOMLConfig()
	defer func() {
		SetGlobalTOMLConfig(oldCfg)
		os.Unsetenv("EXCLUSION_GLOBS")
	}()

	os.Unsetenv("EXCLUSION_GLOBS")
	SetGlobalTOMLConfig(nil)

	globs := DiscoveryExclusionGlobs()
	require.NotEmpty(t, globs)
	assert.Contains(t, globs, "fixtures")
	assert.Contains(t, globs, "node_modules")
}
