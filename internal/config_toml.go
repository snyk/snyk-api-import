package internal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
)

// globalTOMLConfig holds the loaded TOML config for use by commands
// This is set by main.go after loading the config
var globalTOMLConfig *TOMLConfig

// SetGlobalTOMLConfig sets the global TOML config
// This should be called by main.go after loading the config
func SetGlobalTOMLConfig(cfg *TOMLConfig) {
	globalTOMLConfig = cfg
}

// GetGlobalTOMLConfig returns the global TOML config
// Returns nil if no config was loaded
func GetGlobalTOMLConfig() *TOMLConfig {
	return globalTOMLConfig
}

// ApplySourceConfigToEnv is a helper function for commands to apply
// integration-specific config based on the --source flag
// This should be called by commands after parsing flags
func ApplySourceConfigToEnv(source string) error {
	if globalTOMLConfig == nil {
		// No TOML config loaded, nothing to do
		return nil
	}

	return globalTOMLConfig.ApplyIntegrationToEnvironment(source)
}

// TOMLConfig represents the complete TOML configuration file structure
type TOMLConfig struct {
	Snyk         SnykConfig                   `toml:"snyk"`
	Logging      LoggingConfigTOML            `toml:"logging"`
	Integrations map[string]IntegrationConfig `toml:"integrations"`
	Sync         SyncConfigTOML               `toml:"sync"`
	Import       ImportConfigTOML             `toml:"import"`
	Cache        CacheConfig                  `toml:"cache"`
	RateLimit    RateLimitConfigTOML          `toml:"rate_limit"`
}

// SnykConfig holds Snyk API configuration
type SnykConfig struct {
	Token   string `toml:"token"`
	OrgID   string `toml:"org_id"`
	GroupID string `toml:"group_id"`
	APIURL  string `toml:"api_url"`
}

// LoggingConfigTOML holds logging configuration from TOML
type LoggingConfigTOML struct {
	Path       string `toml:"path"`
	Level      string `toml:"level"`
	MaxSizeMB  int    `toml:"max_size_mb"`
	MaxBackups int    `toml:"max_backups"`
	MaxAgeDays int    `toml:"max_age_days"`
	Compress   bool   `toml:"compress"`
}

// IntegrationConfig holds integration-specific configuration
type IntegrationConfig struct {
	Enabled          bool   `toml:"enabled"`
	OrgID            string `toml:"org_id"` // Snyk Organization Public ID (same as orgPublicId)
	Token            string `toml:"token"`
	Username         string `toml:"username"`
	Password         string `toml:"password"`
	ClientID         string `toml:"client_id"`
	ClientSecret     string `toml:"client_secret"`
	AppID            string `toml:"app_id"`
	InstallationID   string `toml:"installation_id"`
	PrivateKeyPath   string `toml:"private_key_path"`
	PrivateKey       string `toml:"private_key"`
	BaseURL          string `toml:"base_url"`
	APIURL           string `toml:"api_url"`
	DefaultOrg       string `toml:"default_org"`
	DefaultGroup     string `toml:"default_group"`
	DefaultWorkspace string `toml:"default_workspace"`
	DefaultProject   string `toml:"default_project"`
}

// SyncConfigTOML holds sync-specific configuration from TOML
type SyncConfigTOML struct {
	DryRun                     bool `toml:"dry_run"`
	EnableBranchUpdateFallback bool `toml:"enable_branch_update_fallback"`
	ConcurrentImports          int  `toml:"concurrent_imports"`
	SkipEmptyOrgs              bool `toml:"skip_empty_orgs"`
}

// ImportConfigTOML holds import-specific configuration from TOML
type ImportConfigTOML struct {
	ManifestTypes      []string `toml:"manifest_types"`
	ExclusionGlobs     []string `toml:"exclusion_globs"`
	Concurrency        int      `toml:"concurrency"`
	PollTimeoutMinutes int      `toml:"poll_timeout_minutes"`
}

// CacheConfig holds cache configuration
type CacheConfig struct {
	Enabled  bool   `toml:"enabled"`
	Path     string `toml:"path"`
	TTLHours int    `toml:"ttl_hours"`
}

// RateLimitConfigTOML holds rate limiting configuration from TOML
type RateLimitConfigTOML struct {
	RequestsPerSecond float64 `toml:"requests_per_second"` // API requests per second (default: 2)
	BurstSize         int     `toml:"burst_size"`          // Max burst size (default: 10)
	MaxRetries        int     `toml:"max_retries"`         // Max retry attempts (default: 5)
	InitialBackoffMs  int     `toml:"initial_backoff_ms"`  // Initial backoff in milliseconds (default: 1000)
	MaxBackoffMs      int     `toml:"max_backoff_ms"`      // Max backoff in milliseconds (default: 30000)
}

// LoadTOMLConfig loads configuration from a TOML file
// Search order:
//  1. Path specified by configPath parameter (if not empty)
//  2. ./config.toml (current directory)
//  3. $SNYK_LOG_PATH/config.toml (if SNYK_LOG_PATH is set)
//  4. ~/.snyk-api-import/config.toml (user home)
//  5. /etc/snyk-api-import/config.toml (system-wide, Linux/macOS)
//
// Returns nil, nil if no config file is found (not an error - can fall back to env vars)
func LoadTOMLConfig(configPath string) (*TOMLConfig, error) {
	var paths []string

	if configPath != "" {
		// User specified a config file - only try this path
		paths = []string{configPath}
	} else {
		// Search default locations
		paths = []string{
			"./config.toml",
		}

		// Add SNYK_LOG_PATH config path if set
		if logPath := os.Getenv("SNYK_LOG_PATH"); logPath != "" {
			paths = append(paths, filepath.Join(logPath, "config.toml"))
		}

		// Add user home config path
		if home := os.Getenv("HOME"); home != "" {
			paths = append(paths, filepath.Join(home, ".snyk-api-import", "config.toml"))
		}

		// Add system-wide config path (Linux/macOS only)
		paths = append(paths, "/etc/snyk-api-import/config.toml")
	}

	// Try each path
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			Logger.Debugf("Found config file at: %s", path)
			return loadConfigFromFile(path)
		}
	}

	// No config file found - this is OK, we can fall back to environment variables
	if configPath != "" {
		// User explicitly specified a config file that doesn't exist - that's an error
		return nil, fmt.Errorf("config file not found: %s", configPath)
	}

	Logger.Debugf("No config.toml found in default locations, using environment variables")
	return nil, nil
}

// loadConfigFromFile loads and parses a TOML config file
func loadConfigFromFile(path string) (*TOMLConfig, error) {
	var cfg TOMLConfig

	// Set defaults
	cfg.Logging.Level = "info"
	cfg.Logging.MaxSizeMB = 10
	cfg.Logging.MaxBackups = 3
	cfg.Logging.MaxAgeDays = 28
	cfg.Sync.ConcurrentImports = 5
	cfg.Cache.TTLHours = 24
	cfg.Snyk.APIURL = "https://api.snyk.io"
	cfg.RateLimit.RequestsPerSecond = 2.0
	cfg.RateLimit.BurstSize = 10
	cfg.RateLimit.MaxRetries = 5
	cfg.RateLimit.InitialBackoffMs = 1000
	cfg.RateLimit.MaxBackoffMs = 30000

	// Parse TOML
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file %s: %w", path, err)
	}

	// Validate required fields
	if cfg.Snyk.Token == "" {
		return nil, fmt.Errorf("snyk.token is required in config file")
	}
	if cfg.Logging.Path == "" {
		return nil, fmt.Errorf("logging.path is required in config file")
	}

	// Expand paths
	cfg.Logging.Path = expandPath(cfg.Logging.Path)
	cfg.Cache.Path = expandPath(cfg.Cache.Path)

	// Expand private key paths for GitHub App
	if githubApp, ok := cfg.Integrations["github-cloud-app"]; ok {
		if githubApp.PrivateKeyPath != "" {
			githubApp.PrivateKeyPath = expandPath(githubApp.PrivateKeyPath)
			cfg.Integrations["github-cloud-app"] = githubApp
		}
	}

	Logger.Infof("Loaded configuration from: %s", path)
	return &cfg, nil
}

// GetIntegrationConfig returns configuration for a specific source
// Returns an error if the integration is not configured or is disabled
func (c *TOMLConfig) GetIntegrationConfig(source string) (*IntegrationConfig, error) {
	// Normalize source name
	normalizedSource := normalizeSourceName(source)

	integration, ok := c.Integrations[normalizedSource]
	if !ok {
		return nil, fmt.Errorf("no configuration found for source: %s (normalized: %s)", source, normalizedSource)
	}

	if !integration.Enabled {
		return nil, fmt.Errorf("integration %s is disabled in config (set enabled=true to use it)", source)
	}

	return &integration, nil
}

// normalizeSourceName converts various source names to config keys
func normalizeSourceName(source string) string {
	source = strings.ToLower(strings.TrimSpace(source))

	switch source {
	case "github", "github-com":
		return "github"
	case "github-enterprise":
		return "github"
	case "github-cloud-app":
		return "github-cloud-app"
	case "gitlab":
		return "gitlab"
	case "bitbucket-cloud":
		return "bitbucket-cloud"
	case "bitbucket-cloud-app":
		return "bitbucket-cloud-app"
	case "bitbucket-server":
		return "bitbucket-server"
	case "azure-repos":
		return "azure-repos"
	default:
		return source
	}
}

// expandPath expands ~ to home directory and environment variables
func expandPath(path string) string {
	if path == "" {
		return path
	}

	// Expand environment variables
	path = os.ExpandEnv(path)

	// Expand ~ to home directory (cross-platform)
	if len(path) > 0 && path[0] == '~' {
		home, err := os.UserHomeDir()
		if err == nil && home != "" {
			if len(path) == 1 {
				return home
			}
			return filepath.Join(home, path[1:])
		}
	}

	return path
}

// MergeWithEnv merges config with environment variables
// Environment variables take precedence over config file values
func (c *TOMLConfig) MergeWithEnv() {
	// Initialize integrations map if nil
	if c.Integrations == nil {
		c.Integrations = make(map[string]IntegrationConfig)
	}

	// Snyk config
	if token := os.Getenv("SNYK_TOKEN"); token != "" {
		Logger.Debugf("Overriding snyk.token from SNYK_TOKEN environment variable")
		c.Snyk.Token = token
	}
	if groupID := os.Getenv("SNYK_GROUP_ID"); groupID != "" {
		Logger.Debugf("Overriding snyk.group_id from SNYK_GROUP_ID environment variable")
		c.Snyk.GroupID = groupID
	}
	if apiURL := os.Getenv("SNYK_API_URL"); apiURL != "" {
		Logger.Debugf("Overriding snyk.api_url from SNYK_API_URL environment variable")
		c.Snyk.APIURL = apiURL
	}

	// Logging config
	if logPath := os.Getenv("SNYK_LOG_PATH"); logPath != "" {
		Logger.Debugf("Overriding logging.path from SNYK_LOG_PATH environment variable")
		c.Logging.Path = logPath
	}
	if logLevel := os.Getenv("SNYK_LOG_LEVEL"); logLevel != "" {
		Logger.Debugf("Overriding logging.level from SNYK_LOG_LEVEL environment variable")
		c.Logging.Level = logLevel
	}

	// GitHub
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		if github, ok := c.Integrations["github"]; ok {
			github.Token = token
			c.Integrations["github"] = github
		} else {
			c.Integrations["github"] = IntegrationConfig{
				Enabled: true,
				Token:   token,
			}
		}
	}
	if apiURL := os.Getenv("GITHUB_API_URL"); apiURL != "" {
		if github, ok := c.Integrations["github"]; ok {
			github.APIURL = apiURL
			c.Integrations["github"] = github
		} else {
			c.Integrations["github"] = IntegrationConfig{
				Enabled: true,
				APIURL:  apiURL,
			}
		}
	}

	// GitHub App
	if appID := os.Getenv("GITHUB_APP_ID"); appID != "" {
		if githubApp, ok := c.Integrations["github-cloud-app"]; ok {
			githubApp.AppID = appID
			c.Integrations["github-cloud-app"] = githubApp
		} else {
			c.Integrations["github-cloud-app"] = IntegrationConfig{
				Enabled: true,
				AppID:   appID,
			}
		}
	}
	if installID := os.Getenv("GITHUB_APP_INSTALLATION_ID"); installID != "" {
		if githubApp, ok := c.Integrations["github-cloud-app"]; ok {
			githubApp.InstallationID = installID
			c.Integrations["github-cloud-app"] = githubApp
		}
	}
	if keyPath := os.Getenv("GITHUB_APP_PRIVATE_KEY_PATH"); keyPath != "" {
		if githubApp, ok := c.Integrations["github-cloud-app"]; ok {
			githubApp.PrivateKeyPath = keyPath
			c.Integrations["github-cloud-app"] = githubApp
		}
	}

	// GitLab
	if token := os.Getenv("GITLAB_TOKEN"); token != "" {
		if gitlab, ok := c.Integrations["gitlab"]; ok {
			gitlab.Token = token
			c.Integrations["gitlab"] = gitlab
		} else {
			c.Integrations["gitlab"] = IntegrationConfig{
				Enabled: true,
				Token:   token,
			}
		}
	}
	if baseURL := os.Getenv("GITLAB_BASE_URL"); baseURL != "" {
		if gitlab, ok := c.Integrations["gitlab"]; ok {
			gitlab.BaseURL = baseURL
			c.Integrations["gitlab"] = gitlab
		}
	}

	// Bitbucket Cloud
	if username := os.Getenv("BITBUCKET_CLOUD_USERNAME"); username != "" {
		if bb, ok := c.Integrations["bitbucket-cloud"]; ok {
			bb.Username = username
			c.Integrations["bitbucket-cloud"] = bb
		} else {
			c.Integrations["bitbucket-cloud"] = IntegrationConfig{
				Enabled:  true,
				Username: username,
			}
		}
	}
	if password := os.Getenv("BITBUCKET_CLOUD_PASSWORD"); password != "" {
		if bb, ok := c.Integrations["bitbucket-cloud"]; ok {
			bb.Password = password
			c.Integrations["bitbucket-cloud"] = bb
		}
	}

	// Bitbucket Cloud App
	if clientID := os.Getenv("BITBUCKET_APP_CLIENT_ID"); clientID != "" {
		if bbApp, ok := c.Integrations["bitbucket-cloud-app"]; ok {
			bbApp.ClientID = clientID
			c.Integrations["bitbucket-cloud-app"] = bbApp
		} else {
			c.Integrations["bitbucket-cloud-app"] = IntegrationConfig{
				Enabled:  true,
				ClientID: clientID,
			}
		}
	}
	if clientSecret := os.Getenv("BITBUCKET_APP_CLIENT_SECRET"); clientSecret != "" {
		if bbApp, ok := c.Integrations["bitbucket-cloud-app"]; ok {
			bbApp.ClientSecret = clientSecret
			c.Integrations["bitbucket-cloud-app"] = bbApp
		}
	}

	// Bitbucket Server
	if token := os.Getenv("BITBUCKET_SERVER_TOKEN"); token != "" {
		if bbServer, ok := c.Integrations["bitbucket-server"]; ok {
			bbServer.Token = token
			c.Integrations["bitbucket-server"] = bbServer
		} else {
			c.Integrations["bitbucket-server"] = IntegrationConfig{
				Enabled: true,
				Token:   token,
			}
		}
	}
	if baseURL := os.Getenv("BITBUCKET_SERVER_URL"); baseURL != "" {
		if bbServer, ok := c.Integrations["bitbucket-server"]; ok {
			bbServer.BaseURL = baseURL
			c.Integrations["bitbucket-server"] = bbServer
		}
	}

	// Azure DevOps
	if token := os.Getenv("AZURE_TOKEN"); token != "" {
		if azure, ok := c.Integrations["azure-repos"]; ok {
			azure.Token = token
			c.Integrations["azure-repos"] = azure
		} else {
			c.Integrations["azure-repos"] = IntegrationConfig{
				Enabled: true,
				Token:   token,
			}
		}
	}
	if baseURL := os.Getenv("AZURE_BASE_URL"); baseURL != "" {
		if azure, ok := c.Integrations["azure-repos"]; ok {
			azure.BaseURL = baseURL
			c.Integrations["azure-repos"] = azure
		}
	}
}

// ApplyToEnvironment sets environment variables from the config
// This allows existing code that reads from environment variables to work seamlessly
func (c *TOMLConfig) ApplyToEnvironment() {
	// Snyk config
	if c.Snyk.Token != "" {
		os.Setenv("SNYK_TOKEN", c.Snyk.Token)
	}
	if c.Snyk.OrgID != "" {
		os.Setenv("ORG_ID", c.Snyk.OrgID)
	}
	if c.Snyk.GroupID != "" {
		os.Setenv("SNYK_GROUP_ID", c.Snyk.GroupID)
	}
	if c.Snyk.APIURL != "" {
		os.Setenv("SNYK_API_URL", c.Snyk.APIURL)
		// Also set SNYK_API for backward compatibility with API functions
		os.Setenv("SNYK_API", c.Snyk.APIURL)
	}

	// Logging config
	if c.Logging.Path != "" {
		os.Setenv("SNYK_LOG_PATH", c.Logging.Path)
	}
	if c.Logging.Level != "" {
		os.Setenv("SNYK_LOG_LEVEL", c.Logging.Level)
	}

	// Apply rate limit config to the singleton
	c.ApplyRateLimitConfig()
}

// ApplyRateLimitConfig configures the rate limiter and retry settings from config
func (c *TOMLConfig) ApplyRateLimitConfig() {
	// Apply rate limit config if non-default values are set
	if c.RateLimit.RequestsPerSecond > 0 || c.RateLimit.BurstSize > 0 {
		cfg := DefaultRateLimitConfig()
		if c.RateLimit.RequestsPerSecond > 0 {
			cfg.RequestsPerSecond = c.RateLimit.RequestsPerSecond
		}
		if c.RateLimit.BurstSize > 0 {
			cfg.BurstSize = c.RateLimit.BurstSize
		}
		ResetSnykRateLimiter(&cfg)
		Logger.Debugf("Rate limit configured: %.2f req/s, burst %d", cfg.RequestsPerSecond, cfg.BurstSize)
	}

	// Apply retry config if non-default values are set
	if c.RateLimit.MaxRetries > 0 || c.RateLimit.InitialBackoffMs > 0 || c.RateLimit.MaxBackoffMs > 0 {
		cfg := DefaultRetryConfig()
		if c.RateLimit.MaxRetries > 0 {
			cfg.MaxRetries = c.RateLimit.MaxRetries
		}
		if c.RateLimit.InitialBackoffMs > 0 {
			cfg.InitialBackoff = time.Duration(c.RateLimit.InitialBackoffMs) * time.Millisecond
		}
		if c.RateLimit.MaxBackoffMs > 0 {
			cfg.MaxBackoff = time.Duration(c.RateLimit.MaxBackoffMs) * time.Millisecond
		}
		// Intentionally discarding restore function - config applies globally for CLI lifetime
		_ = SetDefaultRetryConfig(cfg)
		Logger.Debugf("Retry configured: max %d, initial %dms, max %dms",
			cfg.MaxRetries, c.RateLimit.InitialBackoffMs, c.RateLimit.MaxBackoffMs)
	}
}

// ApplyIntegrationToEnvironment sets environment variables for a specific integration
// based on the source type. This allows existing code to work without modification.
func (c *TOMLConfig) ApplyIntegrationToEnvironment(source string) error {
	integration, err := c.GetIntegrationConfig(source)
	if err != nil {
		// Integration not configured or disabled - not necessarily an error
		// The calling code can fall back to environment variables
		return err
	}

	// Set ORG_ID if specified for this integration (takes precedence over global org_id)
	if integration.OrgID != "" {
		os.Setenv("ORG_ID", integration.OrgID)
	}

	normalizedSource := normalizeSourceName(source)

	switch normalizedSource {
	case "github":
		if integration.Token != "" {
			os.Setenv("GITHUB_TOKEN", integration.Token)
		}
		if integration.APIURL != "" {
			os.Setenv("GITHUB_API_URL", integration.APIURL)
		}

	case "github-cloud-app":
		if integration.AppID != "" {
			os.Setenv("GITHUB_APP_ID", integration.AppID)
			Logger.Debugf("Set GITHUB_APP_ID=%s", integration.AppID)
		}
		if integration.InstallationID != "" {
			os.Setenv("GITHUB_APP_INSTALLATION_ID", integration.InstallationID)
			Logger.Debugf("Set GITHUB_APP_INSTALLATION_ID=%s", integration.InstallationID)
		}
		// Handle private key: if PrivateKeyPath is set, read the file content
		if integration.PrivateKeyPath != "" {
			keyContent, err := os.ReadFile(integration.PrivateKeyPath)
			if err != nil {
				Logger.Warnf("Failed to read GitHub App private key from %s: %v", integration.PrivateKeyPath, err)
			} else {
				os.Setenv("GITHUB_APP_PRIVATE_KEY", string(keyContent))
				Logger.Debugf("Successfully loaded GitHub App private key from %s (%d bytes)", integration.PrivateKeyPath, len(keyContent))
			}
		} else if integration.PrivateKey != "" {
			// If PrivateKey is set directly (inline in config), use it
			os.Setenv("GITHUB_APP_PRIVATE_KEY", integration.PrivateKey)
			Logger.Debugf("Set GITHUB_APP_PRIVATE_KEY from inline config (%d bytes)", len(integration.PrivateKey))
		}

	case "gitlab":
		if integration.Token != "" {
			os.Setenv("GITLAB_TOKEN", integration.Token)
		}
		if integration.BaseURL != "" {
			os.Setenv("GITLAB_BASE_URL", integration.BaseURL)
		}

	case "bitbucket-cloud":
		if integration.Username != "" {
			os.Setenv("BITBUCKET_CLOUD_USERNAME", integration.Username)
		}
		if integration.Password != "" {
			os.Setenv("BITBUCKET_CLOUD_PASSWORD", integration.Password)
		}

	case "bitbucket-cloud-app":
		if integration.ClientID != "" {
			os.Setenv("BITBUCKET_APP_CLIENT_ID", integration.ClientID)
		}
		if integration.ClientSecret != "" {
			os.Setenv("BITBUCKET_APP_CLIENT_SECRET", integration.ClientSecret)
		}

	case "bitbucket-server":
		if integration.Token != "" {
			os.Setenv("BITBUCKET_SERVER_TOKEN", integration.Token)
		}
		if integration.BaseURL != "" {
			os.Setenv("BITBUCKET_SERVER_URL", integration.BaseURL)
		}

	case "azure-repos":
		if integration.Token != "" {
			os.Setenv("AZURE_TOKEN", integration.Token)
		}
		if integration.BaseURL != "" {
			os.Setenv("AZURE_BASE_URL", integration.BaseURL)
		}
	}

	Logger.Debugf("Applied %s integration config to environment", source)
	return nil
}
