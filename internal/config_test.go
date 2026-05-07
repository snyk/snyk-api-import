package internal

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/sam1el/snyk-api-import-go/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsUnsafePath_EmptyPath(t *testing.T) {
	if !IsUnsafePath("") {
		t.Error("Empty path should be unsafe")
	}
}

func TestIsUnsafePath_NullByte(t *testing.T) {
	if !IsUnsafePath("test\x00file") {
		t.Error("Path with null byte should be unsafe")
	}
}

func TestIsUnsafePath_ParentDirectory(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"single dot-dot", "..", true},
		{"relative parent", "../", true},
		{"parent in path", "../test", true},
		{"multiple parents", "../../etc/passwd", true},
		{"current dir", ".", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsUnsafePath(tt.path); got != tt.want {
				t.Errorf("IsUnsafePath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestIsUnsafePath_SafePaths(t *testing.T) {
	// Set up temp directory as SNYK_LOG_PATH
	td := t.TempDir()
	t.Setenv("SNYK_LOG_PATH", td)

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"simple filename", "test.log", false},
		{"subdirectory", "logs/test.log", false},
		{"nested subdirectory", "logs/2024/test.log", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsUnsafePath(tt.path); got != tt.want {
				t.Errorf("IsUnsafePath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestIsUnsafePath_AbsolutePath(t *testing.T) {
	td := t.TempDir()
	t.Setenv("SNYK_LOG_PATH", td)

	// Create a test file within the temp dir
	safeFile := filepath.Join(td, "safe.log")
	unsafeFile := "/etc/passwd"

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"safe absolute within base", safeFile, false},
		{"unsafe absolute outside base", unsafeFile, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsUnsafePath(tt.path); got != tt.want {
				t.Errorf("IsUnsafePath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestIsUnsafePath_NoLogPathSet(t *testing.T) {
	// Unset SNYK_LOG_PATH to test fallback to cwd
	oldLogPath := os.Getenv("SNYK_LOG_PATH")
	os.Unsetenv("SNYK_LOG_PATH")
	defer func() {
		if oldLogPath != "" {
			os.Setenv("SNYK_LOG_PATH", oldLogPath)
		}
	}()

	// Safe relative paths should work with cwd
	if IsUnsafePath("test.log") {
		t.Error("Simple filename should be safe even without SNYK_LOG_PATH")
	}

	// Parent traversal should still be unsafe
	if !IsUnsafePath("../test.log") {
		t.Error("Parent traversal should be unsafe even without SNYK_LOG_PATH")
	}
}

func TestSplitPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want []string
	}{
		{
			name: "unix path",
			path: "a/b/c",
			want: []string{"a", "b", "c"},
		},
		{
			name: "windows path",
			path: "a\\b\\c",
			want: []string{"a", "b", "c"},
		},
		{
			name: "mixed separators",
			path: "a/b\\c",
			want: []string{"a", "b", "c"},
		},
		{
			name: "single component",
			path: "file.txt",
			want: []string{"file.txt"},
		},
		{
			name: "empty path",
			path: "",
			want: nil,
		},
		{
			name: "trailing slash",
			path: "a/b/",
			want: []string{"a", "b"},
		},
		{
			name: "leading slash",
			path: "/a/b",
			want: []string{"a", "b"},
		},
		{
			name: "multiple slashes",
			path: "a//b///c",
			want: []string{"a", "b", "c"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SplitPath(tt.path)
			if len(got) != len(tt.want) {
				t.Errorf("SplitPath(%q) = %v, want %v", tt.path, got, tt.want)
				return
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("SplitPath(%q)[%d] = %q, want %q", tt.path, i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestGetEnv(t *testing.T) {
	testKey := "TEST_ENV_VAR_12345"
	testValue := "test-value"

	// Test when variable is not set
	if got := GetEnv(testKey); got != "" {
		t.Errorf("GetEnv(%q) = %q, want empty string", testKey, got)
	}

	// Test when variable is set
	t.Setenv(testKey, testValue)
	if got := GetEnv(testKey); got != testValue {
		t.Errorf("GetEnv(%q) = %q, want %q", testKey, got, testValue)
	}
}

func TestLoadAppConfigFromEnv_Defaults(t *testing.T) {
	// Clear relevant env vars
	oldVars := map[string]string{
		"SNYK_LOG_PATH":               os.Getenv("SNYK_LOG_PATH"),
		"SNYK_TOKEN":                  os.Getenv("SNYK_TOKEN"),
		"SNYK_LOG_LEVEL":              os.Getenv("SNYK_LOG_LEVEL"),
		"SNYK_LOG_MAX_SIZE_MB":        os.Getenv("SNYK_LOG_MAX_SIZE_MB"),
		"SNYK_LOG_MAX_BACKUPS":        os.Getenv("SNYK_LOG_MAX_BACKUPS"),
		"SNYK_LOG_MAX_AGE_DAYS":       os.Getenv("SNYK_LOG_MAX_AGE_DAYS"),
		"SNYK_LOG_COMPRESS":           os.Getenv("SNYK_LOG_COMPRESS"),
		"BITBUCKET_APP_CLIENT_ID":     os.Getenv("BITBUCKET_APP_CLIENT_ID"),
		"BITBUCKET_APP_CLIENT_SECRET": os.Getenv("BITBUCKET_APP_CLIENT_SECRET"),
	}
	defer func() {
		for k, v := range oldVars {
			if v != "" {
				os.Setenv(k, v)
			} else {
				os.Unsetenv(k)
			}
		}
	}()

	for k := range oldVars {
		os.Unsetenv(k)
	}

	cfg := LoadAppConfigFromEnv()

	// Check defaults (empty string for LogLevel when not set)
	if cfg.LogLevel != "" {
		t.Errorf("LogLevel = %q, want empty string (default)", cfg.LogLevel)
	}
	if cfg.LogMaxSizeMB != 10 {
		t.Errorf("LogMaxSizeMB = %d, want %d (default)", cfg.LogMaxSizeMB, 10)
	}
	if cfg.LogMaxBackups != 3 {
		t.Errorf("LogMaxBackups = %d, want %d (default)", cfg.LogMaxBackups, 3)
	}
	if cfg.LogMaxAgeDays != 28 {
		t.Errorf("LogMaxAgeDays = %d, want %d (default)", cfg.LogMaxAgeDays, 28)
	}
	if cfg.LogCompress != false {
		t.Errorf("LogCompress = %v, want %v (default)", cfg.LogCompress, false)
	}
}

func TestLoadAppConfigFromEnv_CustomValues(t *testing.T) {
	td := t.TempDir()

	t.Setenv("SNYK_LOG_PATH", td)
	t.Setenv("SNYK_TOKEN", "test-token")
	t.Setenv("SNYK_LOG_LEVEL", "debug")
	t.Setenv("SNYK_LOG_MAX_SIZE_MB", "50")
	t.Setenv("SNYK_LOG_MAX_BACKUPS", "5")
	t.Setenv("SNYK_LOG_MAX_AGE_DAYS", "14")
	t.Setenv("SNYK_LOG_COMPRESS", "true")
	t.Setenv("BITBUCKET_APP_CLIENT_ID", "client-id-123")
	t.Setenv("BITBUCKET_APP_CLIENT_SECRET", "secret-456")

	cfg := LoadAppConfigFromEnv()

	if cfg.SnykLogPath != td {
		t.Errorf("SnykLogPath = %q, want %q", cfg.SnykLogPath, td)
	}
	if cfg.SnykToken != "test-token" {
		t.Errorf("SnykToken = %q, want %q", cfg.SnykToken, "test-token")
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, "debug")
	}
	if cfg.LogMaxSizeMB != 50 {
		t.Errorf("LogMaxSizeMB = %d, want %d", cfg.LogMaxSizeMB, 50)
	}
	if cfg.LogMaxBackups != 5 {
		t.Errorf("LogMaxBackups = %d, want %d", cfg.LogMaxBackups, 5)
	}
	if cfg.LogMaxAgeDays != 14 {
		t.Errorf("LogMaxAgeDays = %d, want %d", cfg.LogMaxAgeDays, 14)
	}
	if cfg.LogCompress != true {
		t.Errorf("LogCompress = %v, want %v", cfg.LogCompress, true)
	}
	if cfg.BitbucketAppClientID != "client-id-123" {
		t.Errorf("BitbucketAppClientID = %q, want %q", cfg.BitbucketAppClientID, "client-id-123")
	}
	if cfg.BitbucketAppClientSecret != "secret-456" {
		t.Errorf("BitbucketAppClientSecret = %q, want %q", cfg.BitbucketAppClientSecret, "secret-456")
	}
}

func TestLoadAppConfigFromEnv_InvalidNumbers(t *testing.T) {
	t.Setenv("SNYK_LOG_MAX_SIZE_MB", "invalid")
	t.Setenv("SNYK_LOG_MAX_BACKUPS", "not-a-number")
	t.Setenv("SNYK_LOG_MAX_AGE_DAYS", "abc")

	cfg := LoadAppConfigFromEnv()

	// Should fall back to defaults for invalid values
	if cfg.LogMaxSizeMB != 10 {
		t.Errorf("LogMaxSizeMB with invalid input = %d, want default %d", cfg.LogMaxSizeMB, 10)
	}
	if cfg.LogMaxBackups != 3 {
		t.Errorf("LogMaxBackups with invalid input = %d, want default %d", cfg.LogMaxBackups, 3)
	}
	if cfg.LogMaxAgeDays != 28 {
		t.Errorf("LogMaxAgeDays with invalid input = %d, want default %d", cfg.LogMaxAgeDays, 28)
	}
}

func TestLoadAppConfigFromEnv_BooleanParsing(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{"true lowercase", "true", true},
		{"TRUE uppercase", "TRUE", true},
		{"True mixed", "True", true},
		{"1 as true", "1", true},
		{"false lowercase", "false", false},
		{"FALSE uppercase", "FALSE", false},
		{"0 as false", "0", false},
		{"empty as false", "", false},
		{"invalid as false", "invalid", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("SNYK_LOG_COMPRESS", tt.value)
			cfg := LoadAppConfigFromEnv()
			if cfg.LogCompress != tt.want {
				t.Errorf("LogCompress with %q = %v, want %v", tt.value, cfg.LogCompress, tt.want)
			}
		})
	}
}

// ==============================================================================
// IsAllowedRemoteURL Tests
// ==============================================================================

func TestIsAllowedRemoteURL_ValidCases(t *testing.T) {
	tests := []struct {
		name         string
		url          string
		allowedHosts []string
		expected     bool
	}{
		{
			name:         "Exact host match",
			url:          "https://api.github.com/repos",
			allowedHosts: []string{"api.github.com"},
			expected:     true,
		},
		{
			name:         "Subdomain match",
			url:          "https://api.example.github.com/path",
			allowedHosts: []string{"github.com"},
			expected:     true,
		},
		{
			name:         "Multiple allowed hosts - first matches",
			url:          "https://gitlab.com/api",
			allowedHosts: []string{"gitlab.com", "github.com"},
			expected:     true,
		},
		{
			name:         "Multiple allowed hosts - second matches",
			url:          "https://api.github.com/repos",
			allowedHosts: []string{"gitlab.com", "api.github.com"},
			expected:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsAllowedRemoteURL(tt.url, tt.allowedHosts)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsAllowedRemoteURL_InvalidCases(t *testing.T) {
	tests := []struct {
		name         string
		url          string
		allowedHosts []string
		expected     bool
	}{
		{
			name:         "Empty URL",
			url:          "",
			allowedHosts: []string{"example.com"},
			expected:     false,
		},
		{
			name:         "HTTP not HTTPS",
			url:          "http://api.github.com/repos",
			allowedHosts: []string{"api.github.com"},
			expected:     false,
		},
		{
			name:         "URL with credentials",
			url:          "https://user:pass@api.github.com/repos",
			allowedHosts: []string{"api.github.com"},
			expected:     false,
		},
		{
			name:         "IP address (IPv4)",
			url:          "https://192.168.1.1/api",
			allowedHosts: []string{"192.168.1.1"},
			expected:     false,
		},
		{
			name:         "IP address (IPv6)",
			url:          "https://[::1]/api",
			allowedHosts: []string{"::1"},
			expected:     false,
		},
		{
			name:         "Non-standard port",
			url:          "https://api.github.com:8443/repos",
			allowedHosts: []string{"api.github.com"},
			expected:     false,
		},
		{
			name:         "Host not in allowed list",
			url:          "https://evil.com/api",
			allowedHosts: []string{"github.com", "gitlab.com"},
			expected:     false,
		},
		{
			name:         "Partial host match (security)",
			url:          "https://evil-github.com/api",
			allowedHosts: []string{"github.com"},
			expected:     false,
		},
		{
			name:         "Invalid URL format",
			url:          "not-a-valid-url",
			allowedHosts: []string{"example.com"},
			expected:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsAllowedRemoteURL(tt.url, tt.allowedHosts)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsAllowedRemoteURL_StandardHTTPSPort(t *testing.T) {
	// Standard HTTPS port 443 should be allowed (if specified)
	// Actually, looking at the code, it rejects non-443 ports
	// but allows URLs without explicit port (defaults to 443)
	tests := []struct {
		name     string
		url      string
		expected bool
	}{
		{
			name:     "No port specified (defaults to 443)",
			url:      "https://api.github.com/repos",
			expected: true,
		},
		{
			name:     "Explicit port 443",
			url:      "https://api.github.com:443/repos",
			expected: true,
		},
	}

	allowedHosts := []string{"api.github.com"}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsAllowedRemoteURL(tt.url, allowedHosts)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// ==============================================================================
// SanitizeWorkspace Tests
// ==============================================================================

func TestSanitizeWorkspace_ValidCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Simple lowercase",
			input:    "workspace",
			expected: "workspace",
		},
		{
			name:     "Simple uppercase",
			input:    "WORKSPACE",
			expected: "WORKSPACE",
		},
		{
			name:     "Mixed case",
			input:    "MyWorkspace",
			expected: "MyWorkspace",
		},
		{
			name:     "With numbers",
			input:    "workspace123",
			expected: "workspace123",
		},
		{
			name:     "With hyphens",
			input:    "my-workspace",
			expected: "my-workspace",
		},
		{
			name:     "With underscores",
			input:    "my_workspace",
			expected: "my_workspace",
		},
		{
			name:     "With dots",
			input:    "my.workspace",
			expected: "my.workspace",
		},
		{
			name:     "Complex valid name",
			input:    "MyWorkspace_123-test.v2",
			expected: "MyWorkspace_123-test.v2",
		},
		{
			name:     "With leading/trailing spaces (trimmed)",
			input:    "  workspace  ",
			expected: "workspace",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := SanitizeWorkspace(tt.input)
			require.NoError(t, err)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestSanitizeWorkspace_InvalidCases(t *testing.T) {
	tests := []struct {
		name          string
		input         string
		errorContains string
	}{
		{
			name:          "Empty string",
			input:         "",
			errorContains: "empty workspace",
		},
		{
			name:          "Only whitespace",
			input:         "   ",
			errorContains: "empty workspace after trim",
		},
		{
			name:          "Starts with number",
			input:         "123workspace",
			errorContains: "must start with a letter",
		},
		{
			name:          "Starts with hyphen",
			input:         "-workspace",
			errorContains: "must start with a letter",
		},
		{
			name:          "Starts with underscore",
			input:         "_workspace",
			errorContains: "must start with a letter",
		},
		{
			name:          "Contains space",
			input:         "my workspace",
			errorContains: "invalid character",
		},
		{
			name:          "Contains slash",
			input:         "my/workspace",
			errorContains: "invalid character",
		},
		{
			name:          "Contains special chars",
			input:         "workspace!",
			errorContains: "invalid character",
		},
		{
			name:          "Contains at symbol",
			input:         "workspace@test",
			errorContains: "invalid character",
		},
		{
			name:          "Contains hash",
			input:         "workspace#test",
			errorContains: "invalid character",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := SanitizeWorkspace(tt.input)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.errorContains)
			assert.Empty(t, result)
		})
	}
}

// ==============================================================================
// LoadImportConfig Tests
// ==============================================================================

func TestLoadImportConfig_Success(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	// Create a valid config file
	config := ImportConfig{
		Source:     "github",
		Token:      "test-token-123",
		Workspaces: []string{"workspace1", "workspace2"},
	}

	configData, err := json.MarshalIndent(config, "", "  ")
	require.NoError(t, err)

	configFile := testutil.CreateTempFile(t, string(configData))

	// Load the config
	loaded, err := LoadImportConfig(configFile)
	require.NoError(t, err)
	require.NotNil(t, loaded)

	assert.Equal(t, "github", loaded.Source)
	assert.Equal(t, "test-token-123", loaded.Token)
	assert.Len(t, loaded.Workspaces, 2)
	assert.Equal(t, "workspace1", loaded.Workspaces[0])
	assert.Equal(t, "workspace2", loaded.Workspaces[1])
}

func TestLoadImportConfig_MissingRequiredField(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	// Create a config without required "source" field
	config := map[string]interface{}{
		"token":      "test-token",
		"workspaces": []string{"workspace1"},
	}

	configData, err := json.MarshalIndent(config, "", "  ")
	require.NoError(t, err)

	configFile := testutil.CreateTempFile(t, string(configData))

	// Load should fail due to missing source
	loaded, err := LoadImportConfig(configFile)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing required field: source")
	assert.Nil(t, loaded)
}

func TestLoadImportConfig_InvalidJSON(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	configFile := testutil.CreateTempFile(t, "{ invalid json }")

	loaded, err := LoadImportConfig(configFile)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "error decoding config")
	assert.Nil(t, loaded)
}

func TestLoadImportConfig_FileNotFound(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	loaded, err := LoadImportConfig("/nonexistent/config.json")
	assert.Error(t, err)
	assert.Nil(t, loaded)
}

func TestLoadImportConfig_DirectoryNotFile(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	tmpDir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", tmpDir)

	// Try to load a directory instead of a file
	loaded, err := LoadImportConfig(tmpDir)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "directory, not a file")
	assert.Nil(t, loaded)
}

func TestLoadImportConfig_FileTooLarge(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	// Create a file larger than 1MB
	tmpDir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", tmpDir)

	largeFile := filepath.Join(tmpDir, "large.json")
	// Create a 2MB file
	data := make([]byte, 2<<20)
	for i := range data {
		data[i] = 'a'
	}
	err := os.WriteFile(largeFile, data, 0600)
	require.NoError(t, err)

	loaded, err := LoadImportConfig(largeFile)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "too large")
	assert.Nil(t, loaded)
}

func TestLoadImportConfig_UnknownFields(t *testing.T) {
	cleanup := testutil.SetupTestEnvVars(t, nil)
	defer cleanup()

	// Create config with unknown field
	configData := `{
		"source": "github",
		"orgID": "org-123",
		"unknownField": "should fail"
	}`

	configFile := testutil.CreateTempFile(t, configData)

	loaded, err := LoadImportConfig(configFile)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "error decoding config")
	assert.Nil(t, loaded)
}
