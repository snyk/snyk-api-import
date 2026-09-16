package internal

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildImportRequestBody_IncludesExclusionGlobs(t *testing.T) {
	excl := "fixtures,test"
	body := buildImportRequestBody(ImportTarget{
		Target:         Target{Name: "r", Owner: "o", Branch: "main"},
		ExclusionGlobs: &excl,
	}, "github")

	assert.Equal(t, "fixtures,test", body["exclusionGlobs"])
}

func TestBuildImportRequestBody_IncludesFiles(t *testing.T) {
	body := buildImportRequestBody(ImportTarget{
		Target: Target{Name: "r", Owner: "o", Branch: "main"},
		Files:  []FilePath{{Path: "package.json"}, {Path: "Gemfile"}},
	}, "github")

	files, ok := body["files"].([]FilePath)
	require.True(t, ok)
	assert.Len(t, files, 2)
	assert.Equal(t, "package.json", files[0].Path)
}

func TestBuildImportRequestBody_OmitsWhenUnset(t *testing.T) {
	body := buildImportRequestBody(ImportTarget{
		Target: Target{Name: "r", Owner: "o", Branch: "main"},
	}, "github")

	_, hasExcl := body["exclusionGlobs"]
	_, hasFiles := body["files"]
	assert.False(t, hasExcl)
	assert.False(t, hasFiles)
	assert.Contains(t, body, "target")
}

func TestBuildImportRequestBody_EmptyStringExclusion(t *testing.T) {
	empty := ""
	body := buildImportRequestBody(ImportTarget{
		Target:         Target{Name: "r", Owner: "o", Branch: "main"},
		ExclusionGlobs: &empty,
	}, "github")

	excl, ok := body["exclusionGlobs"].(string)
	require.True(t, ok)
	assert.Equal(t, "", excl)
}

func TestBuildImportRequestBody_MarshaledJSON(t *testing.T) {
	excl := "fixtures"
	empty := ""
	tests := []struct {
		name      string
		target    ImportTarget
		hasExcl   bool
		exclValue string
		hasFiles  bool
	}{
		{
			name: "with exclusions and files",
			target: ImportTarget{
				Target:         Target{Name: "r", Owner: "o", Branch: "main"},
				ExclusionGlobs: &excl,
				Files:          []FilePath{{Path: "pom.xml"}},
			},
			hasExcl: true, exclValue: "fixtures", hasFiles: true,
		},
		{
			name: "empty exclusion string",
			target: ImportTarget{
				Target:         Target{Name: "r", Owner: "o", Branch: "main"},
				ExclusionGlobs: &empty,
			},
			hasExcl: true, exclValue: "",
		},
		{
			name: "omit optional fields",
			target: ImportTarget{
				Target: Target{Name: "r", Owner: "o", Branch: "main"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b, err := json.Marshal(buildImportRequestBody(tt.target, "github"))
			require.NoError(t, err)
			var parsed map[string]interface{}
			require.NoError(t, json.Unmarshal(b, &parsed))
			if tt.hasExcl {
				assert.Equal(t, tt.exclValue, parsed["exclusionGlobs"])
			} else {
				assert.NotContains(t, parsed, "exclusionGlobs")
			}
			if tt.hasFiles {
				assert.Contains(t, parsed, "files")
			} else {
				assert.NotContains(t, parsed, "files")
			}
		})
	}
}

func TestParseImportTargetsJSON_WithOptionalFields(t *testing.T) {
	data := []byte(`{
		"targets": [{
			"target": {"name": "goof", "owner": "acme", "branch": "main"},
			"orgId": "org-1",
			"integrationId": "int-1",
			"exclusionGlobs": "fixtures,test",
			"files": [{"path": "package.json"}]
		}]
	}`)
	targets, err := ParseImportTargetsJSON(data)
	require.NoError(t, err)
	require.Len(t, targets, 1)
	require.NotNil(t, targets[0].ExclusionGlobs)
	assert.Equal(t, "fixtures,test", *targets[0].ExclusionGlobs)
	require.Len(t, targets[0].Files, 1)
	assert.Equal(t, "package.json", targets[0].Files[0].Path)
}

func TestParseImportTargetsJSON_FixtureFile(t *testing.T) {
	data, err := os.ReadFile("testdata/targets-with-exclusions.json")
	require.NoError(t, err)
	targets, err := ParseImportTargetsJSON(data)
	require.NoError(t, err)
	require.Len(t, targets, 2)
	require.NotNil(t, targets[0].ExclusionGlobs)
	assert.Equal(t, "fixtures,test", *targets[0].ExclusionGlobs)
	require.Len(t, targets[0].Files, 1)
	require.NotNil(t, targets[1].ExclusionGlobs)
	assert.Equal(t, "", *targets[1].ExclusionGlobs)
}
