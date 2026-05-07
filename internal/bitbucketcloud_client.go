package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/sam1el/snyk-api-import-go/internal/security"
)

// BitbucketClientInterface defines the methods needed for Bitbucket API interactions
// This interface allows for dependency injection and easier testing
type BitbucketClientInterface interface {
	// FetchWorkspaces retrieves all workspaces the user has access to
	FetchWorkspaces(ctx context.Context) ([]map[string]interface{}, error)

	// FetchRepositories retrieves all repositories for a given workspace
	FetchRepositories(ctx context.Context, workspace string) ([]map[string]interface{}, error)

	// FetchDefaultBranch retrieves the default branch for a specific repository
	FetchDefaultBranch(ctx context.Context, workspace, repoSlug string) (string, error)
}

// bitbucketClientImpl implements BitbucketClientInterface using the actual Bitbucket API
type bitbucketClientImpl struct {
	auth    *BitbucketCloudAuth
	baseURL string
	client  *security.Client
}

// NewBitbucketClientWrapper creates a new Bitbucket client wrapper
func NewBitbucketClientWrapper(auth *BitbucketCloudAuth) (BitbucketClientInterface, error) {
	if auth == nil {
		return nil, fmt.Errorf("auth is required")
	}

	return &bitbucketClientImpl{
		auth:    auth,
		baseURL: "https://api.bitbucket.org/2.0",
		client:  security.NewClient(),
	}, nil
}

// bitbucketWorkspaceSlugFromEnv returns a single workspace slug when cross-workspace listing
// is unavailable (e.g. OAuth client_credentials). Checked in order of precedence.
func bitbucketWorkspaceSlugFromEnv() string {
	for _, k := range []string{
		"BITBUCKET_CLOUD_DEFAULT_WORKSPACE",
		"BITBUCKET_WORKSPACE",
		"BITBUCKET_APP_TEST_WORKSPACE",
		"BITBUCKET_TEST_WORKSPACE",
	} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

// fetchBitbucketUserWorkspaces lists workspaces via GET /2.0/user/workspaces (pagination).
// Replaces deprecated GET /2.0/workspaces (Bitbucket CHANGE-2770 / CHANGE-3022 brownouts).
func fetchBitbucketUserWorkspaces(ctx context.Context, baseURL string, setAuth func(*http.Request), client *security.Client) ([]map[string]interface{}, error) {
	var allWorkspaces []map[string]interface{}
	nextURL := baseURL + "/user/workspaces?pagelen=100"

	for nextURL != "" {
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		setAuth(req)
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		if cerr := resp.Body.Close(); cerr != nil {
			Logger.Warnf("failed to close response body: %v", cerr)
		}
		if err != nil {
			return nil, fmt.Errorf("read body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
		}

		var result struct {
			Values []struct {
				Workspace struct {
					Slug string `json:"slug"`
					Name string `json:"name"`
					UUID string `json:"uuid"`
				} `json:"workspace"`
			} `json:"values"`
			Next string `json:"next"`
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}

		for _, row := range result.Values {
			if row.Workspace.Slug == "" {
				continue
			}
			allWorkspaces = append(allWorkspaces, map[string]interface{}{
				"slug": row.Workspace.Slug,
				"name": row.Workspace.Name,
				"uuid": row.Workspace.UUID,
			})
		}
		nextURL = result.Next
	}

	return allWorkspaces, nil
}

// FetchWorkspaces retrieves all workspaces the caller may access.
func (c *bitbucketClientImpl) FetchWorkspaces(ctx context.Context) ([]map[string]interface{}, error) {
	setAuth := func(req *http.Request) {
		c.auth.SetAuthHeader(req)
	}
	maps, err := fetchBitbucketUserWorkspaces(ctx, c.baseURL, setAuth, c.client)
	if err != nil {
		if slug := bitbucketWorkspaceSlugFromEnv(); slug != "" {
			Logger.Warnf("Bitbucket workspace list failed (%v); using workspace %q from BITBUCKET_CLOUD_DEFAULT_WORKSPACE / BITBUCKET_WORKSPACE / BITBUCKET_APP_TEST_WORKSPACE", err, slug)
			return []map[string]interface{}{{"slug": slug}}, nil
		}
		return nil, err
	}
	// OAuth client_credentials often returns 200 with an empty list on /user/workspaces; use env slug when set.
	if len(maps) == 0 {
		if slug := bitbucketWorkspaceSlugFromEnv(); slug != "" {
			Logger.Warnf("Bitbucket returned no workspaces; using workspace %q from environment", slug)
			return []map[string]interface{}{{"slug": slug}}, nil
		}
	}
	return maps, nil
}

// FetchRepositories retrieves all repositories for a workspace
func (c *bitbucketClientImpl) FetchRepositories(ctx context.Context, workspace string) ([]map[string]interface{}, error) {
	var allRepos []map[string]interface{}
	nextURL := fmt.Sprintf("%s/repositories/%s?pagelen=100", c.baseURL, workspace)

	for nextURL != "" {
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		c.auth.SetAuthHeader(req)

		resp, err := c.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}
		defer func() {
			if cerr := resp.Body.Close(); cerr != nil {
				Logger.Warnf("failed to close response body: %v", cerr)
			}
		}()

		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("bitbucket cloud workspace '%s' not found (404)", workspace)
		}
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
		}

		var result struct {
			Values []map[string]interface{} `json:"values"`
			Next   string                   `json:"next"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}

		allRepos = append(allRepos, result.Values...)
		nextURL = result.Next
	}

	return allRepos, nil
}

// FetchDefaultBranch retrieves the default branch for a repository
func (c *bitbucketClientImpl) FetchDefaultBranch(ctx context.Context, workspace, repoSlug string) (string, error) {
	url := fmt.Sprintf("%s/repositories/%s/%s", c.baseURL, workspace, repoSlug)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	c.auth.SetAuthHeader(req)

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			Logger.Warnf("failed to close response body: %v", cerr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		MainBranch struct {
			Name string `json:"name"`
		} `json:"mainbranch"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	return result.MainBranch.Name, nil
}
