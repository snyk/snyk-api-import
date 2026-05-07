package internal

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/go-github/v57/github"
)

// GitHubAppConfig holds GitHub App authentication configuration
type GitHubAppConfig struct {
	AppID          string
	PrivateKey     string
	InstallationID string // Optional, can be discovered
}

// GitHubAppToken holds a cached installation token
type GitHubAppToken struct {
	Token  string
	Expiry time.Time
}

var (
	cachedAppToken *GitHubAppToken
	tokenMutex     sync.Mutex
)

// GetGitHubAppConfig retrieves GitHub App configuration from environment variables
func GetGitHubAppConfig() (GitHubAppConfig, error) {
	appID := os.Getenv("GITHUB_APP_ID")
	privateKey := os.Getenv("GITHUB_APP_PRIVATE_KEY")
	installationID := os.Getenv("GITHUB_APP_INSTALLATION_ID")

	if appID == "" {
		return GitHubAppConfig{}, fmt.Errorf("GITHUB_APP_ID environment variable is required. Please set it to your GitHub App ID")
	}

	if privateKey == "" {
		return GitHubAppConfig{}, fmt.Errorf("GITHUB_APP_PRIVATE_KEY environment variable is required. Please set it to your GitHub App private key (PEM format)")
	}

	// Validate that the private key looks like a PEM key
	if !strings.Contains(privateKey, "-----BEGIN") || !strings.Contains(privateKey, "-----END") {
		return GitHubAppConfig{}, fmt.Errorf("GITHUB_APP_PRIVATE_KEY must be in PEM format. Please ensure it starts with '-----BEGIN' and ends with '-----END'")
	}

	// Validate app ID is numeric
	if _, err := strconv.Atoi(appID); err != nil {
		return GitHubAppConfig{}, fmt.Errorf("GITHUB_APP_ID must be a numeric string. Please check your GitHub App ID")
	}

	return GitHubAppConfig{
		AppID:          appID,
		PrivateKey:     privateKey,
		InstallationID: installationID,
	}, nil
}

// parsePrivateKey parses a PEM-encoded RSA private key
func parsePrivateKey(pemKey string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the private key")
	}

	// Try parsing as PKCS1
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	// Try parsing as PKCS8
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, fmt.Errorf("private key is not an RSA key")
	}

	return nil, fmt.Errorf("failed to parse private key")
}

// generateJWT creates a JWT for GitHub App authentication
func generateJWT(appID string, privateKey *rsa.PrivateKey) (string, error) {
	now := time.Now()

	claims := jwt.MapClaims{
		"iat": now.Unix(),
		"exp": now.Add(10 * time.Minute).Unix(), // JWT expires in 10 minutes
		"iss": appID,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(privateKey)
}

// GitHubAppTransport implements http.RoundTripper for GitHub App authentication
type GitHubAppTransport struct {
	Transport http.RoundTripper
	Token     string
}

// RoundTrip implements the RoundTripper interface
func (t *GitHubAppTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("Authorization", "Bearer "+t.Token)
	req.Header.Set("Accept", "application/vnd.github+json")
	return t.Transport.RoundTrip(req)
}

// FetchGitHubAppToken gets an installation access token for the GitHub App
func FetchGitHubAppToken(ctx context.Context, config GitHubAppConfig) (string, error) {
	// Check cached token
	tokenMutex.Lock()
	if cachedAppToken != nil && time.Now().Before(cachedAppToken.Expiry) {
		token := cachedAppToken.Token
		tokenMutex.Unlock()
		return token, nil
	}
	tokenMutex.Unlock()

	// Parse private key
	privateKey, err := parsePrivateKey(config.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("parse private key: %w", err)
	}

	// Generate JWT
	jwtToken, err := generateJWT(config.AppID, privateKey)
	if err != nil {
		return "", fmt.Errorf("generate JWT: %w", err)
	}

	// Create a client with JWT authentication for app-level operations
	appTransport := &GitHubAppTransport{
		Transport: http.DefaultTransport,
		Token:     jwtToken,
	}
	appClient := github.NewClient(&http.Client{Transport: appTransport})

	// If installation ID is not provided, we need to discover it
	installationID := config.InstallationID
	if installationID == "" {
		// List installations and use the first one
		installations, _, err := appClient.Apps.ListInstallations(ctx, &github.ListOptions{PerPage: 100})
		if err != nil {
			return "", fmt.Errorf("list installations: %w", err)
		}
		if len(installations) == 0 {
			return "", fmt.Errorf("no installations found for this GitHub App. Please install the app on at least one organization")
		}
		installationID = strconv.FormatInt(*installations[0].ID, 10)
		if installations[0].Account != nil && installations[0].Account.Login != nil {
			Logger.Infof("Using installation ID %s (account: %s)", installationID, *installations[0].Account.Login)
		}
	}

	// Get installation access token
	instID, err := strconv.ParseInt(installationID, 10, 64)
	if err != nil {
		return "", fmt.Errorf("parse installation ID: %w", err)
	}

	token, _, err := appClient.Apps.CreateInstallationToken(ctx, instID, &github.InstallationTokenOptions{})
	if err != nil {
		return "", fmt.Errorf("create installation token: %w", err)
	}

	if token.Token == nil {
		return "", fmt.Errorf("received nil token from GitHub")
	}

	// Cache the token with 50-minute expiry (tokens are valid for 1 hour)
	tokenMutex.Lock()
	cachedAppToken = &GitHubAppToken{
		Token:  *token.Token,
		Expiry: time.Now().Add(50 * time.Minute),
	}
	tokenMutex.Unlock()

	return *token.Token, nil
}

// createGitHubAppClient creates an authenticated GitHub client using the installation token
func createGitHubAppClient(ctx context.Context, token string) *github.Client {
	transport := &GitHubAppTransport{
		Transport: http.DefaultTransport,
		Token:     token,
	}
	return github.NewClient(&http.Client{Transport: transport})
}

// FetchGitHubAppOrgs fetches all organizations with the GitHub App installed
func FetchGitHubAppOrgs(ctx context.Context) ([]*github.Installation, error) {
	config, err := GetGitHubAppConfig()
	if err != nil {
		return nil, err
	}

	// Parse private key and generate JWT
	privateKey, err := parsePrivateKey(config.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	jwtToken, err := generateJWT(config.AppID, privateKey)
	if err != nil {
		return nil, fmt.Errorf("generate JWT: %w", err)
	}

	// Create a client with JWT authentication
	appTransport := &GitHubAppTransport{
		Transport: http.DefaultTransport,
		Token:     jwtToken,
	}
	appClient := github.NewClient(&http.Client{Transport: appTransport})

	// List all installations
	var allInstallations []*github.Installation
	opts := &github.ListOptions{PerPage: 100}

	for {
		installations, resp, err := appClient.Apps.ListInstallations(ctx, opts)
		if err != nil {
			return nil, fmt.Errorf("list installations: %w", err)
		}

		allInstallations = append(allInstallations, installations...)

		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}

	// Filter to only organization installations
	var orgInstallations []*github.Installation
	for _, inst := range allInstallations {
		if inst.Account != nil && inst.Account.Type != nil && *inst.Account.Type == "Organization" {
			orgInstallations = append(orgInstallations, inst)
		}
	}

	return orgInstallations, nil
}

// FetchGitHubAppRepos fetches repositories accessible to the GitHub App for an organization
func FetchGitHubAppRepos(ctx context.Context, token, orgName string, manifestTypes []string) ([]map[string]string, error) {
	client := createGitHubAppClient(ctx, token)

	var allRepos []map[string]string
	opts := &github.RepositoryListByOrgOptions{
		Type:        "all",
		ListOptions: github.ListOptions{PerPage: 100},
	}

	page := 1
	for {
		Logger.Debugf("Fetching GitHub App repos for org %s (page %d)", orgName, page)

		repos, resp, err := client.Repositories.ListByOrg(ctx, orgName, opts)
		if err != nil {
			return nil, fmt.Errorf("list repositories for org %s: %w", orgName, err)
		}

		for _, repo := range repos {
			if repo.Name == nil {
				continue
			}

			// Skip archived repositories
			if repo.GetArchived() {
				Logger.Debugf("Skipping archived repo: %s/%s", orgName, *repo.Name)
				continue
			}

			owner := orgName
			if repo.Owner != nil && repo.Owner.Login != nil {
				owner = *repo.Owner.Login
			}

			branch := "main"
			if repo.DefaultBranch != nil {
				branch = *repo.DefaultBranch
			}

			// For now, add repos without manifest discovery
			// TODO: Implement manifest discovery using GitHub Contents API
			allRepos = append(allRepos, map[string]string{
				"name":   *repo.Name,
				"owner":  owner,
				"branch": branch,
				// manifest will be discovered during import or left empty
			})
		}

		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
		page++
	}

	Logger.Infof("Fetched %d repositories for org %s", len(allRepos), orgName)
	return allRepos, nil
}
