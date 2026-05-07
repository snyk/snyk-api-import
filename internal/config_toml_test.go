package internal

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadTOMLConfig_ValidConfig(t *testing.T) {
	// Create a temporary config file
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")

	configContent := `
[snyk]
token = "test-snyk-token"
group_id = "test-group-id"

[logging]
path = "./logs"
level = "debug"
max_size_mb = 20
max_backups = 5

[integrations.github]
enabled = true
token = "test-github-token"
api_url = "https://api.github.com"

[integrations.gitlab]
enabled = true
token = "test-gitlab-token"
base_url = "https://gitlab.com"
`

	err := os.WriteFile(configPath, []byte(configContent), 0600)
	require.NoError(t, err)

	// Load the config
	cfg, err := LoadTOMLConfig(configPath)
	require.NoError(t, err)
	require.NotNil(t, cfg)

	// Verify Snyk config
	assert.Equal(t, "test-snyk-token", cfg.Snyk.Token)
	assert.Equal(t, "test-group-id", cfg.Snyk.GroupID)

	// Verify logging config
	assert.Equal(t, "./logs", cfg.Logging.Path)
	assert.Equal(t, "debug", cfg.Logging.Level)
	assert.Equal(t, 20, cfg.Logging.MaxSizeMB)
	assert.Equal(t, 5, cfg.Logging.MaxBackups)

	// Verify GitHub integration
	github, ok := cfg.Integrations["github"]
	assert.True(t, ok)
	assert.True(t, github.Enabled)
	assert.Equal(t, "test-github-token", github.Token)
	assert.Equal(t, "https://api.github.com", github.APIURL)

	// Verify GitLab integration
	gitlab, ok := cfg.Integrations["gitlab"]
	assert.True(t, ok)
	assert.True(t, gitlab.Enabled)
	assert.Equal(t, "test-gitlab-token", gitlab.Token)
	assert.Equal(t, "https://gitlab.com", gitlab.BaseURL)
}

func TestLoadTOMLConfig_MissingRequiredFields(t *testing.T) {
	tests := []struct {
		name          string
		configContent string
		expectedError string
	}{
		{
			name: "missing snyk token",
			configContent: `
[logging]
path = "./logs"
`,
			expectedError: "snyk.token is required",
		},
		{
			name: "missing logging path",
			configContent: `
[snyk]
token = "test-token"
`,
			expectedError: "logging.path is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "config.toml")

			err := os.WriteFile(configPath, []byte(tt.configContent), 0600)
			require.NoError(t, err)

			cfg, err := LoadTOMLConfig(configPath)
			assert.Error(t, err)
			assert.Nil(t, cfg)
			assert.Contains(t, err.Error(), tt.expectedError)
		})
	}
}

func TestLoadTOMLConfig_FileNotFound(t *testing.T) {
	// Test with explicit path that doesn't exist
	cfg, err := LoadTOMLConfig("/nonexistent/config.toml")
	assert.Error(t, err)
	assert.Nil(t, cfg)
	assert.Contains(t, err.Error(), "config file not found")

	// Test with no path (searches default locations) - should return nil, nil
	cfg, err = LoadTOMLConfig("")
	assert.NoError(t, err)
	assert.Nil(t, cfg)
}

func TestGetIntegrationConfig(t *testing.T) {
	cfg := &TOMLConfig{
		Integrations: map[string]IntegrationConfig{
			"github": {
				Enabled: true,
				Token:   "github-token",
			},
			"gitlab": {
				Enabled: false,
				Token:   "gitlab-token",
			},
		},
	}

	t.Run("enabled integration", func(t *testing.T) {
		integration, err := cfg.GetIntegrationConfig("github")
		assert.NoError(t, err)
		assert.NotNil(t, integration)
		assert.Equal(t, "github-token", integration.Token)
	})

	t.Run("disabled integration", func(t *testing.T) {
		integration, err := cfg.GetIntegrationConfig("gitlab")
		assert.Error(t, err)
		assert.Nil(t, integration)
		assert.Contains(t, err.Error(), "disabled")
	})

	t.Run("non-existent integration", func(t *testing.T) {
		integration, err := cfg.GetIntegrationConfig("bitbucket-cloud")
		assert.Error(t, err)
		assert.Nil(t, integration)
		assert.Contains(t, err.Error(), "no configuration found")
	})
}

func TestNormalizeSourceName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"github", "github"},
		{"GitHub", "github"},
		{"github-com", "github"},
		{"github-enterprise", "github"},
		{"github-cloud-app", "github-cloud-app"},
		{"gitlab", "gitlab"},
		{"GitLab", "gitlab"},
		{"bitbucket-cloud", "bitbucket-cloud"},
		{"bitbucket-cloud-app", "bitbucket-cloud-app"},
		{"bitbucket-server", "bitbucket-server"},
		{"azure-repos", "azure-repos"},
		{" github ", "github"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := normalizeSourceName(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestExpandPath(t *testing.T) {
	// Get actual home directory for cross-platform testing
	home, err := os.UserHomeDir()
	require.NoError(t, err)

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "tilde expansion",
			input:    "~/.snyk-api-import/config.toml",
			expected: filepath.Join(home, ".snyk-api-import", "config.toml"),
		},
		{
			name:     "tilde only",
			input:    "~",
			expected: home,
		},
		{
			name:     "no tilde",
			input:    "/etc/config.toml",
			expected: "/etc/config.toml",
		},
		{
			name:     "relative path",
			input:    "./logs",
			expected: "./logs",
		},
		{
			name:     "empty path",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := expandPath(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestMergeWithEnv(t *testing.T) {
	// Save original env vars and clear them for test
	originalVars := map[string]string{
		"SNYK_TOKEN":               os.Getenv("SNYK_TOKEN"),
		"GITHUB_TOKEN":             os.Getenv("GITHUB_TOKEN"),
		"GITLAB_TOKEN":             os.Getenv("GITLAB_TOKEN"),
		"BITBUCKET_CLOUD_USERNAME": os.Getenv("BITBUCKET_CLOUD_USERNAME"),
		"BITBUCKET_APP_CLIENT_ID":  os.Getenv("BITBUCKET_APP_CLIENT_ID"),
		"BITBUCKET_SERVER_TOKEN":   os.Getenv("BITBUCKET_SERVER_TOKEN"),
		"AZURE_TOKEN":              os.Getenv("AZURE_TOKEN"),
	}

	// Clear all env vars first
	for key := range originalVars {
		os.Unsetenv(key)
	}

	defer func() {
		// Restore original values
		for key, val := range originalVars {
			if val == "" {
				os.Unsetenv(key)
			} else {
				os.Setenv(key, val)
			}
		}
	}()

	// Create config with some values
	cfg := &TOMLConfig{
		Snyk: SnykConfig{
			Token: "config-snyk-token",
		},
		Integrations: map[string]IntegrationConfig{
			"github": {
				Enabled: true,
				Token:   "config-github-token",
			},
			"gitlab": {
				Enabled: true,
				Token:   "config-gitlab-token",
			},
		},
	}

	// Set environment variables
	t.Setenv("SNYK_TOKEN", "env-snyk-token")
	t.Setenv("GITHUB_TOKEN", "env-github-token")

	// Merge with env
	cfg.MergeWithEnv()

	// Verify env vars override config
	assert.Equal(t, "env-snyk-token", cfg.Snyk.Token, "SNYK_TOKEN should override config")
	assert.Equal(t, "env-github-token", cfg.Integrations["github"].Token, "GITHUB_TOKEN should override config")
	assert.Equal(t, "config-gitlab-token", cfg.Integrations["gitlab"].Token, "GitLab token should remain from config")
}

func TestApplyToEnvironment(t *testing.T) {
	// Save original env vars
	originalVars := map[string]string{
		"SNYK_TOKEN":    os.Getenv("SNYK_TOKEN"),
		"SNYK_LOG_PATH": os.Getenv("SNYK_LOG_PATH"),
	}
	defer func() {
		for key, val := range originalVars {
			if val == "" {
				os.Unsetenv(key)
			} else {
				os.Setenv(key, val)
			}
		}
	}()

	cfg := &TOMLConfig{
		Snyk: SnykConfig{
			Token:   "test-token",
			GroupID: "test-group",
		},
		Logging: LoggingConfigTOML{
			Path:  "./test-logs",
			Level: "debug",
		},
	}

	cfg.ApplyToEnvironment()

	assert.Equal(t, "test-token", os.Getenv("SNYK_TOKEN"))
	assert.Equal(t, "test-group", os.Getenv("SNYK_GROUP_ID"))
	assert.Equal(t, "./test-logs", os.Getenv("SNYK_LOG_PATH"))
	assert.Equal(t, "debug", os.Getenv("SNYK_LOG_LEVEL"))
}

func TestApplyIntegrationToEnvironment(t *testing.T) {
	// Save original env vars
	originalVars := map[string]string{
		"GITHUB_TOKEN":                os.Getenv("GITHUB_TOKEN"),
		"GITLAB_TOKEN":                os.Getenv("GITLAB_TOKEN"),
		"BITBUCKET_CLOUD_USERNAME":    os.Getenv("BITBUCKET_CLOUD_USERNAME"),
		"BITBUCKET_CLOUD_PASSWORD":    os.Getenv("BITBUCKET_CLOUD_PASSWORD"),
		"BITBUCKET_APP_CLIENT_ID":     os.Getenv("BITBUCKET_APP_CLIENT_ID"),
		"BITBUCKET_APP_CLIENT_SECRET": os.Getenv("BITBUCKET_APP_CLIENT_SECRET"),
	}
	defer func() {
		for key, val := range originalVars {
			if val == "" {
				os.Unsetenv(key)
			} else {
				os.Setenv(key, val)
			}
		}
	}()

	cfg := &TOMLConfig{
		Integrations: map[string]IntegrationConfig{
			"github": {
				Enabled: true,
				Token:   "test-github-token",
				APIURL:  "https://api.github.com",
			},
			"gitlab": {
				Enabled: true,
				Token:   "test-gitlab-token",
				BaseURL: "https://gitlab.com",
			},
			"bitbucket-cloud": {
				Enabled:  true,
				Username: "test-user",
				Password: "test-pass",
			},
			"bitbucket-cloud-app": {
				Enabled:      true,
				ClientID:     "test-client-id",
				ClientSecret: "test-client-secret",
			},
		},
	}

	t.Run("apply github config", func(t *testing.T) {
		err := cfg.ApplyIntegrationToEnvironment("github")
		assert.NoError(t, err)
		assert.Equal(t, "test-github-token", os.Getenv("GITHUB_TOKEN"))
		assert.Equal(t, "https://api.github.com", os.Getenv("GITHUB_API_URL"))
	})

	t.Run("apply gitlab config", func(t *testing.T) {
		err := cfg.ApplyIntegrationToEnvironment("gitlab")
		assert.NoError(t, err)
		assert.Equal(t, "test-gitlab-token", os.Getenv("GITLAB_TOKEN"))
		assert.Equal(t, "https://gitlab.com", os.Getenv("GITLAB_BASE_URL"))
	})

	t.Run("apply bitbucket-cloud config", func(t *testing.T) {
		err := cfg.ApplyIntegrationToEnvironment("bitbucket-cloud")
		assert.NoError(t, err)
		assert.Equal(t, "test-user", os.Getenv("BITBUCKET_CLOUD_USERNAME"))
		assert.Equal(t, "test-pass", os.Getenv("BITBUCKET_CLOUD_PASSWORD"))
	})

	t.Run("apply bitbucket-cloud-app config", func(t *testing.T) {
		err := cfg.ApplyIntegrationToEnvironment("bitbucket-cloud-app")
		assert.NoError(t, err)
		assert.Equal(t, "test-client-id", os.Getenv("BITBUCKET_APP_CLIENT_ID"))
		assert.Equal(t, "test-client-secret", os.Getenv("BITBUCKET_APP_CLIENT_SECRET"))
	})

	t.Run("non-existent integration", func(t *testing.T) {
		err := cfg.ApplyIntegrationToEnvironment("non-existent")
		assert.Error(t, err)
	})
}

func TestTOMLConfig_Defaults(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")

	// Minimal config with only required fields
	configContent := `
[snyk]
token = "test-token"

[logging]
path = "./logs"
`

	err := os.WriteFile(configPath, []byte(configContent), 0600)
	require.NoError(t, err)

	cfg, err := LoadTOMLConfig(configPath)
	require.NoError(t, err)
	require.NotNil(t, cfg)

	// Verify defaults are set
	assert.Equal(t, "info", cfg.Logging.Level)
	assert.Equal(t, 10, cfg.Logging.MaxSizeMB)
	assert.Equal(t, 3, cfg.Logging.MaxBackups)
	assert.Equal(t, 28, cfg.Logging.MaxAgeDays)
	assert.Equal(t, 5, cfg.Sync.ConcurrentImports)
	assert.Equal(t, 24, cfg.Cache.TTLHours)
	assert.Equal(t, "https://api.snyk.io", cfg.Snyk.APIURL)
}
