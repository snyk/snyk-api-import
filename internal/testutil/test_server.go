package testutil

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/snyk/snyk-api-import/internal/network"
	"github.com/snyk/snyk-api-import/internal/security"
)

// ServerConfig holds configuration for test server setup
type ServerConfig struct {
	// Handler is the HTTP handler for the test server
	Handler http.HandlerFunc
	// SetupSecurityClient configures the security client (default: true)
	SetupSecurityClient bool
	// SetupNetworkClient configures the network client (default: true)
	SetupNetworkClient bool
	// EnvVars are environment variables to set (e.g., SNYK_API, SNYK_TOKEN)
	EnvVars map[string]string
}

// SetupTestServer creates a test HTTP server with proper cleanup and client injection
// This is the main helper that replaces repetitive httptest.NewServer setup
func SetupTestServer(t *testing.T, config ServerConfig) (*httptest.Server, func()) {
	t.Helper()

	// Create the test server
	server := httptest.NewServer(config.Handler)

	// Extract host from server URL for security client
	serverURL := strings.TrimPrefix(server.URL, "http://")
	serverURL = strings.TrimPrefix(serverURL, "https://")

	var cleanups []func()

	// Setup security client if requested (default: true)
	if config.SetupSecurityClient {
		mockClient := &http.Client{Timeout: 10 * time.Second}
		restore := security.SetTestHTTPClient(mockClient, []string{serverURL})
		cleanups = append(cleanups, restore)
	}

	// Setup network client if requested (default: true)
	if config.SetupNetworkClient {
		restore := network.SetTestClient(func() network.Client {
			return server.Client()
		})
		cleanups = append(cleanups, restore)
	}

	// Set environment variables
	if config.EnvVars == nil {
		config.EnvVars = make(map[string]string)
	}

	// Add default env vars if not specified
	if _, ok := config.EnvVars["SNYK_API"]; !ok {
		config.EnvVars["SNYK_API"] = server.URL
	}
	if _, ok := config.EnvVars["SNYK_TEST_SKIP_URL_VALIDATION"]; !ok {
		config.EnvVars["SNYK_TEST_SKIP_URL_VALIDATION"] = "1"
	}

	envCleanup := SetEnvVars(t, config.EnvVars)
	cleanups = append(cleanups, envCleanup)

	// Return cleanup function that calls all cleanups
	cleanup := func() {
		server.Close()
		for _, fn := range cleanups {
			fn()
		}
	}

	return server, cleanup
}

// SetupImportTestServer is a convenience wrapper for import test servers
// It includes all necessary environment variables for import tests
func SetupImportTestServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, func()) {
	t.Helper()

	return SetupTestServer(t, ServerConfig{
		Handler:             handler,
		SetupSecurityClient: true,
		SetupNetworkClient:  true,
		EnvVars: map[string]string{
			"SNYK_TOKEN":                    "test-token",
			"SNYK_SKIP_POLL":                "1",
			"SNYK_TEST_SKIP_URL_VALIDATION": "1",
		},
	})
}
