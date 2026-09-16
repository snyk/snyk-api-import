package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==============================================================================
// writeResults Tests
// ==============================================================================

func TestWriteResults_Success(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")
	os.Setenv("SNYK_TESTING_MODE", "1")
	defer os.Unsetenv("SNYK_TESTING_MODE")

	outputPath := filepath.Join(dir, "results.json")
	results := map[string]interface{}{
		"success": true,
		"count":   42,
		"items":   []string{"item1", "item2"},
	}

	writeResults(outputPath, results)

	// Verify file was created
	require.FileExists(t, outputPath)

	// Verify content
	data, err := os.ReadFile(outputPath)
	require.NoError(t, err)

	var loaded map[string]interface{}
	err = json.Unmarshal(data, &loaded)
	require.NoError(t, err)

	assert.Equal(t, true, loaded["success"])
	assert.Equal(t, float64(42), loaded["count"]) // JSON unmarshals numbers as float64
}

func TestWriteResults_DefaultFilename(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")
	os.Setenv("SNYK_TESTING_MODE", "1")
	defer os.Unsetenv("SNYK_TESTING_MODE")

	// Change to temp dir so default file is created there
	oldWd, _ := os.Getwd()
	defer os.Chdir(oldWd)
	os.Chdir(dir)

	results := map[string]interface{}{"test": "data"}
	writeResults("", results) // Empty path should use default

	// Default is "import-results.json"
	defaultPath := filepath.Join(dir, "import-results.json")
	require.FileExists(t, defaultPath)
}

func TestWriteResults_CreatesDirectory(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")
	os.Setenv("SNYK_TESTING_MODE", "1")
	defer os.Unsetenv("SNYK_TESTING_MODE")

	nestedPath := filepath.Join(dir, "nested", "deep", "results.json")
	results := map[string]interface{}{"nested": true}

	writeResults(nestedPath, results)

	// Verify directory structure was created
	require.FileExists(t, nestedPath)
}

func TestWriteResults_EmptyResults(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")
	os.Setenv("SNYK_TESTING_MODE", "1")
	defer os.Unsetenv("SNYK_TESTING_MODE")

	outputPath := filepath.Join(dir, "empty.json")
	results := map[string]interface{}{}

	writeResults(outputPath, results)

	require.FileExists(t, outputPath)

	data, err := os.ReadFile(outputPath)
	require.NoError(t, err)
	assert.Equal(t, "{}", string(data))
}

func TestWriteResults_ComplexData(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")
	os.Setenv("SNYK_TESTING_MODE", "1")
	defer os.Unsetenv("SNYK_TESTING_MODE")

	outputPath := filepath.Join(dir, "complex.json")
	results := map[string]interface{}{
		"nested": map[string]interface{}{
			"level2": map[string]interface{}{
				"level3": "deep",
			},
		},
		"array": []interface{}{1, 2, 3},
		"null":  nil,
	}

	writeResults(outputPath, results)

	require.FileExists(t, outputPath)

	data, err := os.ReadFile(outputPath)
	require.NoError(t, err)

	var loaded map[string]interface{}
	err = json.Unmarshal(data, &loaded)
	require.NoError(t, err)

	nested := loaded["nested"].(map[string]interface{})
	level2 := nested["level2"].(map[string]interface{})
	assert.Equal(t, "deep", level2["level3"])
}

// ==============================================================================
// splitAndTrim Tests
// ==============================================================================

func TestSplitAndTrim_SingleValue(t *testing.T) {
	result := splitAndTrim("value1")
	assert.Equal(t, []string{"value1"}, result)
}

func TestSplitAndTrim_MultipleValues(t *testing.T) {
	result := splitAndTrim("value1,value2,value3")
	assert.Equal(t, []string{"value1", "value2", "value3"}, result)
}

func TestSplitAndTrim_WithSpaces(t *testing.T) {
	result := splitAndTrim(" value1 , value2 , value3 ")
	assert.Equal(t, []string{"value1", "value2", "value3"}, result)
}

func TestSplitAndTrim_EmptyString(t *testing.T) {
	result := splitAndTrim("")
	assert.Nil(t, result) // splitComma returns nil for empty string
}

func TestSplitAndTrim_OnlySpaces(t *testing.T) {
	result := splitAndTrim("   ")
	assert.Equal(t, []string{""}, result)
}

func TestSplitAndTrim_EmptyValues(t *testing.T) {
	result := splitAndTrim("value1,,value3")
	assert.Equal(t, []string{"value1", "", "value3"}, result)
}

func TestSplitAndTrim_MixedWhitespace(t *testing.T) {
	// trimSpace only handles space, tab, and newline (not \r)
	result := splitAndTrim("\tvalue1\t,\nvalue2\n")
	assert.Equal(t, []string{"value1", "value2"}, result)
}

// ==============================================================================
// splitComma Tests
// ==============================================================================

func TestSplitComma_SingleValue(t *testing.T) {
	result := splitComma("value1")
	assert.Equal(t, []string{"value1"}, result)
}

func TestSplitComma_MultipleValues(t *testing.T) {
	result := splitComma("value1,value2,value3")
	assert.Equal(t, []string{"value1", "value2", "value3"}, result)
}

func TestSplitComma_EmptyString(t *testing.T) {
	result := splitComma("")
	assert.Nil(t, result)
}

func TestSplitComma_OnlyComma(t *testing.T) {
	// splitComma appends first empty string, but trailing empty is not appended (curr != "")
	result := splitComma(",")
	assert.Equal(t, []string{""}, result)
}

func TestSplitComma_EmptyValues(t *testing.T) {
	result := splitComma("value1,,value3")
	assert.Equal(t, []string{"value1", "", "value3"}, result)
}

func TestSplitComma_NoTrim(t *testing.T) {
	// splitComma doesn't trim spaces, only splits
	result := splitComma(" value1 , value2 ")
	assert.Equal(t, []string{" value1 ", " value2 "}, result)
}

// ==============================================================================
// trimSpace Tests
// ==============================================================================

func TestTrimSpace_NoSpaces(t *testing.T) {
	result := trimSpace("value")
	assert.Equal(t, "value", result)
}

func TestTrimSpace_LeadingSpaces(t *testing.T) {
	result := trimSpace("   value")
	assert.Equal(t, "value", result)
}

func TestTrimSpace_TrailingSpaces(t *testing.T) {
	result := trimSpace("value   ")
	assert.Equal(t, "value", result)
}

func TestTrimSpace_BothSides(t *testing.T) {
	result := trimSpace("   value   ")
	assert.Equal(t, "value", result)
}

func TestTrimSpace_EmptyString(t *testing.T) {
	result := trimSpace("")
	assert.Equal(t, "", result)
}

func TestTrimSpace_OnlySpaces(t *testing.T) {
	result := trimSpace("     ")
	assert.Equal(t, "", result)
}

func TestTrimSpace_TabsAndNewlines(t *testing.T) {
	// trimSpace only handles space, tab, newline (not \r carriage return)
	result := trimSpace("\t\nvalue\n\t")
	assert.Equal(t, "value", result)
}
