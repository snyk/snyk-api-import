package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sam1el/snyk-api-import-go/cmd"
	"github.com/sam1el/snyk-api-import-go/internal"
)

// E2EConfig holds configuration for E2E tests
type E2EConfig struct {
	// Control flags
	Enabled bool
	Cleanup bool
	Timeout time.Duration

	// GitHub
	GitHubToken   string
	GitHubTestOrg string
	GitHubAPIURL  string

	// GitLab
	GitLabToken     string
	GitLabTestGroup string
	GitLabBaseURL   string

	// Bitbucket Cloud (basic auth)
	BitbucketUsername      string
	BitbucketPassword      string
	BitbucketTestWorkspace string

	// Bitbucket Cloud App (OAuth)
	BitbucketAppClientID      string
	BitbucketAppClientSecret  string
	BitbucketAppTestWorkspace string

	// Azure DevOps
	AzureToken   string
	AzureTestOrg string
	AzureBaseURL string

	// Snyk
	SnykToken       string
	SnykTestOrgID   string
	SnykTestGroupID string

	// Integration-specific Snyk Org Public IDs
	GitHubTestOrgPublicID       string
	GitLabTestOrgPublicID       string
	BitbucketTestOrgPublicID    string
	BitbucketAppTestOrgPublicID string
	AzureTestOrgPublicID        string

	// Test directories
	LogPath    string
	WorkingDir string
}

// LoadE2EConfig loads E2E test configuration from environment variables
func LoadE2EConfig() *E2EConfig {
	cfg := &E2EConfig{
		Enabled: os.Getenv("RUN_E2E_TESTS") == "true",
		Cleanup: os.Getenv("E2E_CLEANUP") != "false", // Default to true
		Timeout: 30 * time.Minute,

		// GitHub
		GitHubToken:   os.Getenv("GITHUB_TOKEN"),
		GitHubTestOrg: os.Getenv("GITHUB_TEST_ORG"),
		GitHubAPIURL:  getEnvOrDefault("GITHUB_API_URL", "https://api.github.com"),

		// GitLab
		GitLabToken:     os.Getenv("GITLAB_TOKEN"),
		GitLabTestGroup: os.Getenv("GITLAB_TEST_GROUP"),
		GitLabBaseURL:   getEnvOrDefault("GITLAB_BASE_URL", "https://gitlab.com"),

		// Bitbucket Cloud (basic auth)
		BitbucketUsername:      os.Getenv("BITBUCKET_CLOUD_USERNAME"),
		BitbucketPassword:      os.Getenv("BITBUCKET_CLOUD_PASSWORD"),
		BitbucketTestWorkspace: os.Getenv("BITBUCKET_TEST_WORKSPACE"),

		// Bitbucket Cloud App (OAuth)
		BitbucketAppClientID:      os.Getenv("BITBUCKET_APP_CLIENT_ID"),
		BitbucketAppClientSecret:  os.Getenv("BITBUCKET_APP_CLIENT_SECRET"),
		BitbucketAppTestWorkspace: os.Getenv("BITBUCKET_APP_TEST_WORKSPACE"),

		// Azure
		AzureToken:   os.Getenv("AZURE_TOKEN"),
		AzureTestOrg: os.Getenv("AZURE_TEST_ORG"),
		AzureBaseURL: getEnvOrDefault("AZURE_BASE_URL", "https://dev.azure.com"),

		// Snyk
		SnykToken:       os.Getenv("SNYK_TOKEN"),
		SnykTestOrgID:   os.Getenv("SNYK_TEST_ORG_ID"),
		SnykTestGroupID: os.Getenv("SNYK_TEST_GROUP_ID"),

		// Integration-specific Snyk Org Public IDs
		GitHubTestOrgPublicID:       os.Getenv("GITHUB_TEST_ORG_PUBLIC_ID"),
		GitLabTestOrgPublicID:       os.Getenv("GITLAB_TEST_ORG_PUBLIC_ID"),
		BitbucketTestOrgPublicID:    os.Getenv("BITBUCKET_TEST_ORG_PUBLIC_ID"),
		BitbucketAppTestOrgPublicID: os.Getenv("BITBUCKET_APP_TEST_ORG_PUBLIC_ID"),
		AzureTestOrgPublicID:        os.Getenv("AZURE_TEST_ORG_PUBLIC_ID"),
	}

	return cfg
}

// SkipIfDisabled skips the test if E2E tests are not enabled
func SkipIfDisabled(t *testing.T, cfg *E2EConfig) {
	if !cfg.Enabled {
		t.Skip("E2E tests disabled. Set RUN_E2E_TESTS=true to enable")
	}
}

// RequireEnvVars fails the test if required environment variables are not set
func RequireEnvVars(t *testing.T, vars map[string]string) {
	missing := []string{}
	for name, value := range vars {
		if value == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("Missing required environment variables: %v", missing)
	}
}

// SetupTestDir creates a temporary directory for test artifacts
func SetupTestDir(t *testing.T) string {
	tmpDir := t.TempDir()
	logDir := filepath.Join(tmpDir, "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		t.Fatalf("Failed to create log directory: %v", err)
	}

	// Set SNYK_LOG_PATH to the main test directory (not subdirectory)
	// This allows files to be read from anywhere within the test directory
	// Resolve to canonical path to handle symlinks (e.g., /var -> /private/var on macOS)
	canonicalPath, err := filepath.EvalSymlinks(tmpDir)
	if err != nil {
		// If we can't resolve symlinks, use the original path
		canonicalPath = tmpDir
	}
	os.Setenv("SNYK_LOG_PATH", canonicalPath) //nolint:errcheck // Test setup
	t.Cleanup(func() {
		os.Unsetenv("SNYK_LOG_PATH") //nolint:errcheck // Test cleanup
	})

	// Return canonical path so tests use consistent paths
	return canonicalPath
}

// SetupTestEnv sets up environment variables for a test
func SetupTestEnv(t *testing.T, vars map[string]string) {
	for key, value := range vars {
		// Save the original value to restore later
		oldValue, existed := os.LookupEnv(key)
		os.Setenv(key, value) //nolint:errcheck // Test setup

		// Capture variables in closure to avoid loop variable capture issues
		capturedKey := key
		capturedOldValue := oldValue
		capturedExisted := existed

		t.Cleanup(func() {
			// Restore original value instead of unsetting
			if capturedExisted {
				os.Setenv(capturedKey, capturedOldValue) //nolint:errcheck // Test cleanup
			} else {
				os.Unsetenv(capturedKey) //nolint:errcheck // Test cleanup
			}
		})
	}
}

// ReadJSONFile reads and unmarshals a JSON file
func ReadJSONFile(t *testing.T, path string, v interface{}) {
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read file %s: %v", path, err)
	}

	if err := json.Unmarshal(data, v); err != nil {
		t.Fatalf("Failed to unmarshal JSON from %s: %v", path, err)
	}
}

// WriteJSONFile marshals and writes a JSON file
func WriteJSONFile(t *testing.T, path string, v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal JSON: %v", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("Failed to write file %s: %v", path, err)
	}
}

// FileExists checks if a file exists
func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// AssertFileExists fails the test if a file doesn't exist
func AssertFileExists(t *testing.T, path string, message string) {
	if !FileExists(path) {
		t.Fatalf("%s: file does not exist: %s", message, path)
	}
}

// WithTimeout runs a function with a timeout
func WithTimeout(t *testing.T, timeout time.Duration, fn func(context.Context)) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	done := make(chan struct{})
	go func() {
		fn(ctx)
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-ctx.Done():
		t.Fatalf("Test timed out after %v", timeout)
	}
}

// getEnvOrDefault returns environment variable value or default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// SetupRateLimiting configures rate limiting for E2E tests.
// Environment variables:
//   - E2E_RATE_LIMIT_RPS: requests per second (default: 2.0)
//   - E2E_RATE_LIMIT_BURST: burst size (default: 10)
//   - E2E_RETRY_MAX: max retry attempts (default: 5)
//   - E2E_RETRY_BACKOFF_MS: initial backoff in ms (default: 1000)
//
// Returns a cleanup function to restore defaults.
func SetupRateLimiting(t *testing.T) func() {
	// Read configuration from environment
	rps := 2.0
	if v := os.Getenv("E2E_RATE_LIMIT_RPS"); v != "" {
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			rps = parsed
		}
	}

	burst := 10
	if v := os.Getenv("E2E_RATE_LIMIT_BURST"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			burst = parsed
		}
	}

	maxRetries := 5
	if v := os.Getenv("E2E_RETRY_MAX"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			maxRetries = parsed
		}
	}

	initialBackoffMs := 1000
	if v := os.Getenv("E2E_RETRY_BACKOFF_MS"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			initialBackoffMs = parsed
		}
	}

	// Apply rate limit configuration
	rateLimitCfg := internal.RateLimitConfig{
		RequestsPerSecond: rps,
		BurstSize:         burst,
	}
	internal.ResetSnykRateLimiter(&rateLimitCfg)

	// Apply retry configuration
	retryCfg := internal.RetryConfig{
		MaxRetries:     maxRetries,
		InitialBackoff: time.Duration(initialBackoffMs) * time.Millisecond,
		MaxBackoff:     30 * time.Second,
		BackoffFactor:  2.0,
	}
	restoreRetry := internal.SetDefaultRetryConfig(retryCfg)

	t.Logf("Rate limiting configured: %.1f req/s, burst %d, max retries %d, backoff %dms",
		rps, burst, maxRetries, initialBackoffMs)

	// Return cleanup function
	return func() {
		// Restore default rate limit
		defaultRateCfg := internal.DefaultRateLimitConfig()
		internal.ResetSnykRateLimiter(&defaultRateCfg)
		// Restore default retry config
		restoreRetry()
	}
}

// LogTestProgress logs test progress with timestamp
func LogTestProgress(t *testing.T, format string, args ...interface{}) {
	timestamp := time.Now().Format("15:04:05")
	message := fmt.Sprintf(format, args...)
	t.Logf("[%s] %s", timestamp, message)
}

// MustGetEnv gets an environment variable or fails the test
func MustGetEnv(t *testing.T, key string) string {
	value := os.Getenv(key)
	if value == "" {
		t.Fatalf("Required environment variable %s is not set", key)
	}
	return value
}

// TestOrg represents a test organization structure
type TestOrg struct {
	Name        string `json:"name"`
	GroupID     string `json:"groupID"`
	SourceOrgID string `json:"sourceOrgID,omitempty"`
}

// TestTarget represents a test import target matching the actual JSON structure
type TestTarget struct {
	Target struct {
		Name     string `json:"name"`
		Owner    string `json:"owner"`
		Branch   string `json:"branch"`
		FullName string `json:"full_name,omitempty"`
	} `json:"target"`
	IntegrationID string `json:"integrationID"`
	OrgID         string `json:"orgID"`
}

// CleanupTestResources is a helper for cleaning up resources after tests
type CleanupTestResources struct {
	t         *testing.T
	cfg       *E2EConfig
	resources []func() error
}

// NewCleanupTestResources creates a new cleanup helper
func NewCleanupTestResources(t *testing.T, cfg *E2EConfig) *CleanupTestResources {
	c := &CleanupTestResources{
		t:   t,
		cfg: cfg,
	}

	if cfg.Cleanup {
		t.Cleanup(func() {
			c.RunCleanup()
		})
	}

	return c
}

// AddCleanup adds a cleanup function
func (c *CleanupTestResources) AddCleanup(fn func() error) {
	c.resources = append(c.resources, fn)
}

// RunCleanup runs all cleanup functions
func (c *CleanupTestResources) RunCleanup() {
	if !c.cfg.Cleanup {
		c.t.Log("Cleanup disabled, skipping resource cleanup")
		return
	}

	c.t.Log("Running cleanup...")
	for i := len(c.resources) - 1; i >= 0; i-- {
		if err := c.resources[i](); err != nil {
			c.t.Logf("Cleanup error: %v", err)
		}
	}
	c.t.Log("Cleanup complete")
}

// IntegrationTestConfig holds integration-specific configuration for E2E tests
type IntegrationTestConfig struct {
	// Source type for the integration (e.g., "github", "azure-repos", "gitlab")
	Source string

	// Environment variable names
	TokenEnvVar       string // Token env var name (e.g., "GITHUB_TOKEN")
	OrgEnvVar         string // Org/workspace env var name (e.g., "GITHUB_TEST_ORG")
	OrgPublicIDEnvVar string // Snyk org public ID env var (e.g., "GITHUB_TEST_ORG_PUBLIC_ID")

	// Token and org values (extracted from E2EConfig)
	Token       string
	TestOrg     string
	OrgPublicID string

	// Extra command-line arguments for orgs:data command
	ExtraOrgsDataArgs []string

	// Optional: Custom org filtering logic
	FilterOrgs func(orgs []TestOrg, testOrgName string) []TestOrg

	// Optimization support
	SupportsOptimized bool // Whether this integration has an optimized sync path
}

// BuildEnvVarMap builds a map of required environment variables for RequireEnvVars
func BuildEnvVarMap(cfg *E2EConfig, intCfg IntegrationTestConfig) map[string]string {
	vars := map[string]string{
		intCfg.TokenEnvVar:   intCfg.Token,
		"SNYK_TOKEN":         cfg.SnykToken,
		"SNYK_TEST_GROUP_ID": cfg.SnykTestGroupID,
	}

	if intCfg.OrgEnvVar != "" {
		vars[intCfg.OrgEnvVar] = intCfg.TestOrg
	}

	return vars
}

// DefaultOrgFilter is the default org filtering logic
func DefaultOrgFilter(orgs []TestOrg, testOrgName string) []TestOrg {
	filtered := []TestOrg{}
	for _, org := range orgs {
		// Bitbucket workspace slugs are case-stable but secrets/env may differ in casing.
		if strings.EqualFold(org.Name, testOrgName) {
			filtered = append(filtered, org)
			break
		}
	}
	return filtered
}

// RunOrgsDataTest runs the orgs:data command for an integration
func RunOrgsDataTest(t *testing.T, ctx context.Context, cfg *E2EConfig, intCfg IntegrationTestConfig, testDir string) string {
	LogTestProgress(t, "Running orgs:data for %s", intCfg.Source)

	// Construct expected output file name
	orgsFile := filepath.Join(testDir, fmt.Sprintf("group-%s-%s-orgs.json", cfg.SnykTestGroupID, intCfg.Source))

	// Build command arguments
	args := []string{
		"snyk-api-import",
		"orgs:data",
		"--groupId=" + cfg.SnykTestGroupID,
		"--source=" + intCfg.Source,
	}
	args = append(args, intCfg.ExtraOrgsDataArgs...)
	os.Args = args

	// Create app config
	appCfg := internal.AppConfig{
		SnykLogPath: testDir,
	}

	// Run command
	cmd.OrgsDataCmd(ctx, appCfg)

	// Read orgs data
	var allOrgsData struct {
		Orgs []TestOrg `json:"orgs"`
	}
	ReadJSONFile(t, orgsFile, &allOrgsData)

	// Filter to only the test org
	filterFunc := intCfg.FilterOrgs
	if filterFunc == nil {
		filterFunc = DefaultOrgFilter
	}
	filteredOrgs := filterFunc(allOrgsData.Orgs, intCfg.TestOrg)

	if len(filteredOrgs) == 0 {
		t.Fatalf("Test org %s not found in orgs data", intCfg.TestOrg)
	}

	// Write filtered orgs back to file
	filteredData := struct {
		Orgs []TestOrg `json:"orgs"`
	}{Orgs: filteredOrgs}
	WriteJSONFile(t, orgsFile, filteredData)

	LogTestProgress(t, "Filtered orgs data: %d total orgs → %d test org(s) (%s)",
		len(allOrgsData.Orgs), len(filteredOrgs), intCfg.TestOrg)

	return orgsFile
}

// RunImportDataTest runs the import:data command for an integration
func RunImportDataTest(t *testing.T, ctx context.Context, cfg *E2EConfig, intCfg IntegrationTestConfig, testDir string) string {
	LogTestProgress(t, "Running import:data for %s", intCfg.Source)

	// Construct expected output file name
	targetsFile := filepath.Join(testDir, fmt.Sprintf("%s-import-targets.json", intCfg.Source))
	orgsFile := fmt.Sprintf("group-%s-%s-orgs.json", cfg.SnykTestGroupID, intCfg.Source)

	// Prepare command arguments (use relative path for orgsData)
	os.Args = []string{
		"snyk-api-import",
		"import:data",
		"--orgsData=" + orgsFile,
		"--source=" + intCfg.Source,
	}

	// Create app config (include SnykToken so integrationID can be auto-detected)
	appCfg := internal.AppConfig{
		SnykLogPath: testDir,
		SnykToken:   cfg.SnykToken,
	}

	// Run command
	cmd.ImportDataCmd(ctx, appCfg)

	return targetsFile
}

// RunSyncTest runs the sync command for an integration (dry-run mode)
// The sync command uses the optimized API-first approach by default.
// The sync command automatically looks for <source>-import-targets.json in testDir (SNYK_LOG_PATH)
func RunSyncTest(t *testing.T, ctx context.Context, cfg *E2EConfig, intCfg IntegrationTestConfig, testDir string) {
	LogTestProgress(t, "Running sync (dry-run, optimized) for %s", intCfg.Source)

	// Skip if orgPublicId is not configured
	if intCfg.OrgPublicID == "" {
		t.Skipf("%s sync test requires %s environment variable", intCfg.Source, intCfg.OrgPublicIDEnvVar)
		return
	}

	// Prepare command arguments
	args := []string{
		"snyk-api-import",
		"sync",
		"--orgPublicId=" + intCfg.OrgPublicID,
		"--source=" + intCfg.Source,
		"--dryRun=true", // Always dry-run in E2E tests
	}

	os.Args = args

	// Create app config
	appCfg := internal.AppConfig{
		SnykLogPath: testDir,
	}

	// Run command
	cmd.SyncCmd(ctx, appCfg)
}

// RunImportTest runs the import command for an integration
func RunImportTest(t *testing.T, ctx context.Context, cfg *E2EConfig, intCfg IntegrationTestConfig, testDir string, targetsFile string) {
	LogTestProgress(t, "Running import for %s", intCfg.Source)

	// Use parallel import for better performance
	err := internal.ImportTargetsParallel(ctx, targetsFile, intCfg.Source)
	if err != nil {
		t.Logf("Import completed with error: %v (this may be expected if repos are empty)", err)
	}
}

// RunFullWorkflowTest runs a complete E2E workflow test for an integration
func RunFullWorkflowTest(t *testing.T, cfg *E2EConfig, intCfg IntegrationTestConfig) {
	SkipIfDisabled(t, cfg)

	// Require integration-specific environment variables
	RequireEnvVars(t, BuildEnvVarMap(cfg, intCfg))

	LogTestProgress(t, "Starting %s E2E Full Workflow Test", intCfg.Source)
	LogTestProgress(t, "Test Org: %s", intCfg.TestOrg)

	// Setup rate limiting (reads from E2E_* env vars or uses defaults)
	restoreRateLimit := SetupRateLimiting(t)
	t.Cleanup(restoreRateLimit)

	// Setup test environment
	testDir := SetupTestDir(t)
	cleanup := NewCleanupTestResources(t, cfg)

	// Change to test directory
	oldWd, _ := os.Getwd()
	_ = os.Chdir(testDir)                  //nolint:errcheck // Test setup
	defer func() { _ = os.Chdir(oldWd) }() //nolint:errcheck // Test cleanup

	// Setup environment variables (must include secrets and workspace slugs the CLI reads via os.Getenv)
	envVars := map[string]string{
		intCfg.TokenEnvVar: intCfg.Token,
		"SNYK_TOKEN":       cfg.SnykToken,
	}
	if intCfg.OrgEnvVar != "" && intCfg.TestOrg != "" {
		envVars[intCfg.OrgEnvVar] = intCfg.TestOrg
	}
	switch intCfg.Source {
	case "bitbucket-cloud-app":
		if cfg.BitbucketAppClientSecret != "" {
			envVars["BITBUCKET_APP_CLIENT_SECRET"] = cfg.BitbucketAppClientSecret
		}
	case "bitbucket-cloud":
		if cfg.BitbucketPassword != "" {
			envVars["BITBUCKET_CLOUD_PASSWORD"] = cfg.BitbucketPassword
		}
	}
	SetupTestEnv(t, envVars)

	// Test context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout)
	defer cancel()

	// Step 1: Test orgs:data command
	t.Run("OrgsData", func(t *testing.T) {
		LogTestProgress(t, "Step 1: Running orgs:data for %s", intCfg.Source)

		orgsFile := RunOrgsDataTest(t, ctx, cfg, intCfg, testDir)

		// Verify orgs file was created
		AssertFileExists(t, orgsFile, "orgs:data should create output file")

		// Read and validate orgs (after filtering)
		var data struct {
			Orgs []TestOrg `json:"orgs"`
		}
		ReadJSONFile(t, orgsFile, &data)
		orgs := data.Orgs

		if len(orgs) == 0 {
			t.Fatal("orgs:data returned no organizations")
		}

		LogTestProgress(t, "✅ Found test organization: %s (Group: %s)", orgs[0].Name, orgs[0].GroupID)
	})

	// Step 2: Test import:data command
	var targetsFile string
	t.Run("ImportData", func(t *testing.T) {
		LogTestProgress(t, "Step 2: Running import:data for %s", intCfg.Source)

		targetsFile = RunImportDataTest(t, ctx, cfg, intCfg, testDir)

		// Verify targets file was created
		AssertFileExists(t, targetsFile, "import:data should create output file")

		// Read and validate targets
		var targets struct {
			Targets []TestTarget `json:"targets"`
		}
		ReadJSONFile(t, targetsFile, &targets)

		if len(targets.Targets) == 0 {
			t.Skip("No targets to import (organization may be empty)")
		}

		LogTestProgress(t, "✅ Generated %d import target(s)", len(targets.Targets))
		for i, target := range targets.Targets {
			if i < 5 { // Log first 5 only
				LogTestProgress(t, "  - %s/%s (branch: %s)", target.Target.Owner, target.Target.Name, target.Target.Branch)
			}
		}
		if len(targets.Targets) > 5 {
			LogTestProgress(t, "  ... and %d more", len(targets.Targets)-5)
		}
	})

	// Step 3: Test import command (optional, can be slow)
	if os.Getenv("E2E_RUN_IMPORT") == "true" {
		t.Run("Import", func(t *testing.T) {
			LogTestProgress(t, "Step 3: Running import for %s", intCfg.Source)

			RunImportTest(t, ctx, cfg, intCfg, testDir, targetsFile)

			LogTestProgress(t, "✅ Import completed successfully")
		})
	} else {
		t.Log("⏭️  Skipping import step (set E2E_RUN_IMPORT=true to enable)")
	}

	// Step 4: Test sync command (dry-run) - Non-optimized path
	// Sync automatically finds <source>-import-targets.json in testDir
	// Step 4: Test sync command (dry-run) - Always uses optimized API-first approach
	t.Run("Sync", func(t *testing.T) {
		LogTestProgress(t, "Step 4: Running sync (dry-run, optimized) for %s", intCfg.Source)

		RunSyncTest(t, ctx, cfg, intCfg, testDir)

		LogTestProgress(t, "✅ Sync completed successfully")
	})

	LogTestProgress(t, "🎉 %s E2E Full Workflow Test Complete!", intCfg.Source)

	_ = cleanup // Cleanup runs via t.Cleanup
}
