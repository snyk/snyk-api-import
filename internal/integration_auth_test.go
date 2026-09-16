package internal

import (
	"os"
	"strings"
	"testing"
)

// ==============================================================================
// GitHub Authentication Tests
// ==============================================================================

func TestGetGitHubAuth_Success(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "ghp_test_token_123")
	t.Setenv("GITHUB_API_URL", "https://github.company.com/api/v3")

	auth, err := GetGitHubAuth()
	if err != nil {
		t.Fatalf("GetGitHubAuth() error = %v", err)
	}

	if auth.Token != "ghp_test_token_123" {
		t.Errorf("Token = %q, want %q", auth.Token, "ghp_test_token_123")
	}

	if auth.BaseURL != "https://github.company.com/api/v3" {
		t.Errorf("BaseURL = %q, want %q", auth.BaseURL, "https://github.company.com/api/v3")
	}
}

func TestGetGitHubAuth_DefaultURL(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "ghp_test_token")
	// Don't set GITHUB_API_URL, should default to public GitHub

	auth, err := GetGitHubAuth()
	if err != nil {
		t.Fatalf("GetGitHubAuth() error = %v", err)
	}

	if auth.BaseURL != "https://api.github.com" {
		t.Errorf("BaseURL = %q, want %q (default)", auth.BaseURL, "https://api.github.com")
	}
}

func TestGetGitHubAuth_MissingToken(t *testing.T) {
	// Ensure GITHUB_TOKEN is not set
	oldToken := os.Getenv("GITHUB_TOKEN")
	os.Unsetenv("GITHUB_TOKEN")
	defer func() {
		if oldToken != "" {
			os.Setenv("GITHUB_TOKEN", oldToken)
		}
	}()

	_, err := GetGitHubAuth()
	if err == nil {
		t.Error("Expected error when GITHUB_TOKEN is not set, got nil")
	}

	if !strings.Contains(err.Error(), "GITHUB_TOKEN") {
		t.Errorf("Error message should mention GITHUB_TOKEN, got: %v", err)
	}
}

// ==============================================================================
// GitHub App Authentication Tests
// ==============================================================================

func TestGetGitHubAppConfig_Success(t *testing.T) {
	// Valid PEM key for testing (this is a dummy key, not real)
	testPEM := `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
-----END RSA PRIVATE KEY-----`

	t.Setenv("GITHUB_APP_ID", "123456")
	t.Setenv("GITHUB_APP_PRIVATE_KEY", testPEM)
	t.Setenv("GITHUB_APP_INSTALLATION_ID", "789012")

	config, err := GetGitHubAppConfig()
	if err != nil {
		t.Fatalf("GetGitHubAppConfig() error = %v", err)
	}

	if config.AppID != "123456" {
		t.Errorf("AppID = %q, want %q", config.AppID, "123456")
	}

	if config.PrivateKey != testPEM {
		t.Errorf("PrivateKey mismatch")
	}

	if config.InstallationID != "789012" {
		t.Errorf("InstallationID = %q, want %q", config.InstallationID, "789012")
	}
}

func TestGetGitHubAppConfig_WithoutInstallationID(t *testing.T) {
	// Installation ID is optional and can be discovered
	testPEM := `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
-----END RSA PRIVATE KEY-----`

	t.Setenv("GITHUB_APP_ID", "123456")
	t.Setenv("GITHUB_APP_PRIVATE_KEY", testPEM)
	// Don't set GITHUB_APP_INSTALLATION_ID

	config, err := GetGitHubAppConfig()
	if err != nil {
		t.Fatalf("GetGitHubAppConfig() error = %v", err)
	}

	if config.InstallationID != "" {
		t.Errorf("InstallationID = %q, want empty string", config.InstallationID)
	}
}

func TestGetGitHubAppConfig_MissingAppID(t *testing.T) {
	testPEM := `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
-----END RSA PRIVATE KEY-----`

	oldAppID := os.Getenv("GITHUB_APP_ID")
	os.Unsetenv("GITHUB_APP_ID")
	defer func() {
		if oldAppID != "" {
			os.Setenv("GITHUB_APP_ID", oldAppID)
		}
	}()

	t.Setenv("GITHUB_APP_PRIVATE_KEY", testPEM)

	_, err := GetGitHubAppConfig()
	if err == nil {
		t.Error("Expected error when GITHUB_APP_ID is missing, got nil")
	}

	if !strings.Contains(err.Error(), "GITHUB_APP_ID") {
		t.Errorf("Error should mention GITHUB_APP_ID, got: %v", err)
	}
}

func TestGetGitHubAppConfig_MissingPrivateKey(t *testing.T) {
	oldPrivateKey := os.Getenv("GITHUB_APP_PRIVATE_KEY")
	os.Unsetenv("GITHUB_APP_PRIVATE_KEY")
	defer func() {
		if oldPrivateKey != "" {
			os.Setenv("GITHUB_APP_PRIVATE_KEY", oldPrivateKey)
		}
	}()

	t.Setenv("GITHUB_APP_ID", "123456")

	_, err := GetGitHubAppConfig()
	if err == nil {
		t.Error("Expected error when GITHUB_APP_PRIVATE_KEY is missing, got nil")
	}

	if !strings.Contains(err.Error(), "GITHUB_APP_PRIVATE_KEY") {
		t.Errorf("Error should mention GITHUB_APP_PRIVATE_KEY, got: %v", err)
	}
}

func TestGetGitHubAppConfig_InvalidPEMFormat(t *testing.T) {
	tests := []struct {
		name       string
		privateKey string
	}{
		{
			name:       "plain text (not PEM)",
			privateKey: "this-is-not-a-pem-key",
		},
		{
			name:       "missing BEGIN marker",
			privateKey: "some-key-content-----END RSA PRIVATE KEY-----",
		},
		{
			name:       "missing END marker",
			privateKey: "-----BEGIN RSA PRIVATE KEY-----some-key-content",
		},
		{
			name:       "empty string",
			privateKey: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_APP_ID", "123456")
			t.Setenv("GITHUB_APP_PRIVATE_KEY", tt.privateKey)

			_, err := GetGitHubAppConfig()
			if err == nil {
				t.Error("Expected error for invalid PEM format, got nil")
			}

			if !strings.Contains(err.Error(), "PEM format") {
				t.Errorf("Error should mention PEM format, got: %v", err)
			}
		})
	}
}

func TestGetGitHubAppConfig_InvalidAppID(t *testing.T) {
	testPEM := `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
-----END RSA PRIVATE KEY-----`

	tests := []struct {
		name  string
		appID string
	}{
		{
			name:  "non-numeric app ID",
			appID: "abc123",
		},
		{
			name:  "app ID with letters",
			appID: "12345abc",
		},
		{
			name:  "app ID with special characters",
			appID: "12345-67890",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_APP_ID", tt.appID)
			t.Setenv("GITHUB_APP_PRIVATE_KEY", testPEM)

			_, err := GetGitHubAppConfig()
			if err == nil {
				t.Errorf("Expected error for invalid App ID %q, got nil", tt.appID)
			}

			if !strings.Contains(err.Error(), "numeric") {
				t.Errorf("Error should mention numeric requirement, got: %v", err)
			}
		})
	}
}

func TestGetGitHubAppConfig_ValidNumericAppID(t *testing.T) {
	testPEM := `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
-----END RSA PRIVATE KEY-----`

	tests := []struct {
		name  string
		appID string
	}{
		{
			name:  "small app ID",
			appID: "1",
		},
		{
			name:  "medium app ID",
			appID: "123456",
		},
		{
			name:  "large app ID",
			appID: "9999999999",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_APP_ID", tt.appID)
			t.Setenv("GITHUB_APP_PRIVATE_KEY", testPEM)

			config, err := GetGitHubAppConfig()
			if err != nil {
				t.Errorf("GetGitHubAppConfig() unexpected error = %v", err)
			}

			if config.AppID != tt.appID {
				t.Errorf("AppID = %q, want %q", config.AppID, tt.appID)
			}
		})
	}
}

func TestGetGitHubAppConfig_MultilinePEM(t *testing.T) {
	// Test with actual multi-line PEM format
	multilinePEM := `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
YXl2bGJ2bGJ2bGJ2bGJ2bGJ2bGJ2bGJ2bGJ2bGJ2
ZW5kbGluZXRlc3RlbmRsaW5ldGVzdGVuZGxpbmV0
-----END RSA PRIVATE KEY-----`

	t.Setenv("GITHUB_APP_ID", "123456")
	t.Setenv("GITHUB_APP_PRIVATE_KEY", multilinePEM)

	config, err := GetGitHubAppConfig()
	if err != nil {
		t.Fatalf("GetGitHubAppConfig() error = %v", err)
	}

	if config.PrivateKey != multilinePEM {
		t.Error("PrivateKey should preserve multiline format")
	}
}

func TestGetGitHubAppConfig_DifferentPEMTypes(t *testing.T) {
	// GitHub supports both RSA PRIVATE KEY and PRIVATE KEY (PKCS8) formats
	tests := []struct {
		name string
		pem  string
	}{
		{
			name: "RSA PRIVATE KEY format",
			pem: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JIYkJsAjCXfghpEW5j
-----END RSA PRIVATE KEY-----`,
		},
		{
			name: "PRIVATE KEY format (PKCS8)",
			pem: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSj
-----END PRIVATE KEY-----`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_APP_ID", "123456")
			t.Setenv("GITHUB_APP_PRIVATE_KEY", tt.pem)

			config, err := GetGitHubAppConfig()
			if err != nil {
				t.Errorf("GetGitHubAppConfig() error = %v, want nil", err)
			}

			if config.PrivateKey != tt.pem {
				t.Error("PrivateKey mismatch")
			}
		})
	}
}

// ==============================================================================
// GitLab Authentication Tests
// ==============================================================================

func TestGetGitLabAuth_Success(t *testing.T) {
	t.Setenv("GITLAB_TOKEN", "glpat-test_token_123")
	t.Setenv("GITLAB_BASE_URL", "https://gitlab.company.com")

	auth, err := GetGitLabAuth()
	if err != nil {
		t.Fatalf("GetGitLabAuth() error = %v", err)
	}

	if auth.Token != "glpat-test_token_123" {
		t.Errorf("Token = %q, want %q", auth.Token, "glpat-test_token_123")
	}

	if auth.BaseURL != "https://gitlab.company.com" {
		t.Errorf("BaseURL = %q, want %q", auth.BaseURL, "https://gitlab.company.com")
	}
}

func TestGetGitLabAuth_DefaultURL(t *testing.T) {
	t.Setenv("GITLAB_TOKEN", "glpat-test_token")
	// Don't set GITLAB_BASE_URL, should default to public GitLab

	auth, err := GetGitLabAuth()
	if err != nil {
		t.Fatalf("GetGitLabAuth() error = %v", err)
	}

	if auth.BaseURL != "https://gitlab.com" {
		t.Errorf("BaseURL = %q, want %q (default)", auth.BaseURL, "https://gitlab.com")
	}
}

func TestGetGitLabAuth_MissingToken(t *testing.T) {
	// Ensure GITLAB_TOKEN is not set
	oldToken := os.Getenv("GITLAB_TOKEN")
	os.Unsetenv("GITLAB_TOKEN")
	defer func() {
		if oldToken != "" {
			os.Setenv("GITLAB_TOKEN", oldToken)
		}
	}()

	_, err := GetGitLabAuth()
	if err == nil {
		t.Error("Expected error when GITLAB_TOKEN is not set, got nil")
	}

	if !strings.Contains(err.Error(), "GITLAB_TOKEN") {
		t.Errorf("Error message should mention GITLAB_TOKEN, got: %v", err)
	}
}

// ==============================================================================
// Bitbucket Cloud Authentication Tests
// ==============================================================================

func TestGetBitbucketCloudAuth_Success(t *testing.T) {
	t.Setenv("BITBUCKET_CLOUD_USERNAME", "test_user")
	t.Setenv("BITBUCKET_CLOUD_PASSWORD", "api_token_123")

	auth, err := GetBitbucketCloudAuth()
	if err != nil {
		t.Fatalf("GetBitbucketCloudAuth() error = %v", err)
	}

	if auth.Username != "test_user" {
		t.Errorf("Username = %q, want %q", auth.Username, "test_user")
	}

	if auth.Password != "api_token_123" {
		t.Errorf("Password = %q, want %q", auth.Password, "api_token_123")
	}
}

func TestGetBitbucketCloudAuth_MissingAllCredentials(t *testing.T) {
	// Clear Bitbucket Cloud credential environment variables
	oldUser := os.Getenv("BITBUCKET_CLOUD_USERNAME")
	oldPass := os.Getenv("BITBUCKET_CLOUD_PASSWORD")

	os.Unsetenv("BITBUCKET_CLOUD_USERNAME")
	os.Unsetenv("BITBUCKET_CLOUD_PASSWORD")

	defer func() {
		if oldUser != "" {
			os.Setenv("BITBUCKET_CLOUD_USERNAME", oldUser)
		}
		if oldPass != "" {
			os.Setenv("BITBUCKET_CLOUD_PASSWORD", oldPass)
		}
	}()

	_, err := GetBitbucketCloudAuth()
	if err == nil {
		t.Error("Expected error when no credentials are set, got nil")
	}

	// Error message should mention required environment variables
	if !strings.Contains(err.Error(), "BITBUCKET_CLOUD_USERNAME") || !strings.Contains(err.Error(), "BITBUCKET_CLOUD_PASSWORD") {
		t.Errorf("Error should mention required environment variables, got: %v", err)
	}
}

func TestGetBitbucketCloudAuth_MissingUsername(t *testing.T) {
	oldUser := os.Getenv("BITBUCKET_CLOUD_USERNAME")
	oldPass := os.Getenv("BITBUCKET_CLOUD_PASSWORD")

	os.Unsetenv("BITBUCKET_CLOUD_USERNAME")
	t.Setenv("BITBUCKET_CLOUD_PASSWORD", "api_token_here")

	defer func() {
		if oldUser != "" {
			os.Setenv("BITBUCKET_CLOUD_USERNAME", oldUser)
		}
		if oldPass != "" {
			os.Setenv("BITBUCKET_CLOUD_PASSWORD", oldPass)
		}
	}()

	_, err := GetBitbucketCloudAuth()
	if err == nil {
		t.Error("Expected error when USERNAME is missing, got nil")
	}

	if !strings.Contains(err.Error(), "BITBUCKET_CLOUD_USERNAME") {
		t.Errorf("Error should mention BITBUCKET_CLOUD_USERNAME, got: %v", err)
	}
}

func TestGetBitbucketCloudAuth_MissingPassword(t *testing.T) {
	oldUser := os.Getenv("BITBUCKET_CLOUD_USERNAME")
	oldPass := os.Getenv("BITBUCKET_CLOUD_PASSWORD")

	t.Setenv("BITBUCKET_CLOUD_USERNAME", "test_user")
	os.Unsetenv("BITBUCKET_CLOUD_PASSWORD")

	defer func() {
		if oldUser != "" {
			os.Setenv("BITBUCKET_CLOUD_USERNAME", oldUser)
		}
		if oldPass != "" {
			os.Setenv("BITBUCKET_CLOUD_PASSWORD", oldPass)
		}
	}()

	_, err := GetBitbucketCloudAuth()
	if err == nil {
		t.Error("Expected error when PASSWORD is missing, got nil")
	}

	if !strings.Contains(err.Error(), "BITBUCKET_CLOUD_PASSWORD") {
		t.Errorf("Error should mention BITBUCKET_CLOUD_PASSWORD, got: %v", err)
	}
}

// ==============================================================================
// Azure DevOps Authentication Tests
// ==============================================================================

func TestGetAzureAuth_Success(t *testing.T) {
	t.Setenv("AZURE_TOKEN", "azure_pat_token_123")
	t.Setenv("AZURE_BASE_URL", "https://dev.azure.com/myorg")

	auth, err := GetAzureAuth()
	if err != nil {
		t.Fatalf("GetAzureAuth() error = %v", err)
	}

	if auth.Token != "azure_pat_token_123" {
		t.Errorf("Token = %q, want %q", auth.Token, "azure_pat_token_123")
	}

	if auth.BaseURL != "https://dev.azure.com/myorg" {
		t.Errorf("BaseURL = %q, want %q", auth.BaseURL, "https://dev.azure.com/myorg")
	}
}

func TestGetAzureAuth_DefaultURL(t *testing.T) {
	t.Setenv("AZURE_TOKEN", "azure_token")
	// Don't set AZURE_BASE_URL, should default to dev.azure.com

	auth, err := GetAzureAuth()
	if err != nil {
		t.Fatalf("GetAzureAuth() error = %v", err)
	}

	// Default base URL for Azure DevOps cloud
	if auth.BaseURL != "https://dev.azure.com" {
		t.Errorf("BaseURL = %q, want %q (default)", auth.BaseURL, "https://dev.azure.com")
	}
}

func TestGetAzureAuth_CustomBaseURLTrailingSlash(t *testing.T) {
	t.Setenv("AZURE_TOKEN", "test-token-789")
	t.Setenv("AZURE_BASE_URL", "https://custom.azure.com/")

	auth, err := GetAzureAuth()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if auth.BaseURL != "https://custom.azure.com" {
		t.Errorf("expected base URL without trailing slash 'https://custom.azure.com', got %q", auth.BaseURL)
	}
}

func TestGetAzureAuth_MissingToken(t *testing.T) {
	oldToken := os.Getenv("AZURE_TOKEN")
	os.Unsetenv("AZURE_TOKEN")
	defer func() {
		if oldToken != "" {
			os.Setenv("AZURE_TOKEN", oldToken)
		}
	}()

	_, err := GetAzureAuth()
	if err == nil {
		t.Error("Expected error when AZURE_TOKEN is not set, got nil")
	}

	if !strings.Contains(err.Error(), "AZURE_TOKEN") {
		t.Errorf("Error message should mention AZURE_TOKEN, got: %v", err)
	}
}
