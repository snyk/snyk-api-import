package internal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/snyk/snyk-api-import/internal/security"
)

// BitbucketCloudAuth represents authentication configuration for Bitbucket Cloud
type BitbucketCloudAuth struct {
	Method   string // "basic", "token", "oauth"
	Username string // for Basic Auth
	Password string // for Basic Auth (app password)
	Token    string // for Bearer token auth
}

// GetBitbucketCloudAuth retrieves Bitbucket Cloud credentials from environment variables.
// Bitbucket Cloud uses Basic Authentication with username and API token.
//
// Required environment variables:
// - BITBUCKET_CLOUD_USERNAME: Your Bitbucket username
// - BITBUCKET_CLOUD_PASSWORD: Your Atlassian API token (not an app password)
//
// API token scopes required:
// - read:account
// - read:project:bitbucket
// - read:repository:bitbucket
// - read:workspace:bitbucket
// - read:user:bitbucket
//
// Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens
func GetBitbucketCloudAuth() (*BitbucketCloudAuth, error) {
	username := strings.TrimSpace(os.Getenv("BITBUCKET_CLOUD_USERNAME"))
	password := strings.TrimSpace(os.Getenv("BITBUCKET_CLOUD_PASSWORD"))

	if username == "" || password == "" {
		return nil, fmt.Errorf("BITBUCKET_CLOUD_USERNAME and BITBUCKET_CLOUD_PASSWORD are required. " +
			"Set BITBUCKET_CLOUD_USERNAME to your Bitbucket username and BITBUCKET_CLOUD_PASSWORD to your Atlassian API token. " +
			"Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens")
	}

	return &BitbucketCloudAuth{
		Method:   "basic",
		Username: username,
		Password: password,
	}, nil
}

// SetAuthHeader sets the appropriate Authorization header based on auth configuration
func (auth *BitbucketCloudAuth) SetAuthHeader(req *http.Request) {
	switch auth.Method {
	case "basic":
		// HTTP Basic Auth: base64(username:password)
		credentials := auth.Username + ":" + auth.Password
		encoded := base64.StdEncoding.EncodeToString([]byte(credentials))
		req.Header.Set("Authorization", "Basic "+encoded)
	case "token", "oauth":
		// Bearer token auth
		req.Header.Set("Authorization", "Bearer "+auth.Token)
	}
}

// Org represents a Bitbucket Cloud organization
type Org struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	UUID        string `json:"uuid"`
}

// Repo represents a Bitbucket Cloud repository
type Repo struct {
	Name     string `json:"name"`
	FullName string `json:"full_name"`
	UUID     string `json:"uuid"`
	Owner    struct {
		DisplayName string `json:"display_name"`
		UUID        string `json:"uuid"`
	} `json:"owner"`
	Branch string `json:"branch"` // Default branch (populated separately if needed)
}

// FetchOrgs fetches orgs (teams) from Bitbucket Cloud API using the provided auth.
// For backward compatibility, if auth is nil, it will attempt to get auth from environment.
func FetchOrgs(ctx context.Context, auth *BitbucketCloudAuth) ([]Org, error) {
	if auth == nil {
		var err error
		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return nil, fmt.Errorf("get auth: %w", err)
		}
	}

	base := "https://api.bitbucket.org/2.0/teams?role=member"
	var orgs []Org
	nextURL := base
	client := security.NewClient()
	for nextURL != "" {
		if err := security.IsSafeURL(nextURL, security.DefaultAllowedHosts); err != nil {
			return nil, fmt.Errorf("disallowed pagination URL: %w", err)
		}
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		auth.SetAuthHeader(req)
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			return nil, fmt.Errorf("bitbucket cloud authorization failed for teams: %d (check credentials)", resp.StatusCode)
		}
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("unexpected status: %s", resp.Status)
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read body: %w", err)
		}
		var result struct {
			Values []Org  `json:"values"`
			Next   string `json:"next"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("unmarshal: %w", err)
		}
		orgs = append(orgs, result.Values...)
		nextURL = result.Next
	}
	return orgs, nil
}

// FetchRepos fetches repos for a given workspace/org from Bitbucket Cloud API using the provided auth.
// For backward compatibility, if auth is nil, it will attempt to get auth from environment.
func FetchRepos(ctx context.Context, auth *BitbucketCloudAuth, workspace string) ([]Repo, error) {
	if auth == nil {
		var err error
		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return nil, fmt.Errorf("get auth: %w", err)
		}
	}

	base := fmt.Sprintf("https://api.bitbucket.org/2.0/repositories/%s", workspace)
	var repos []Repo
	nextURL := base
	client := security.NewClient()
	for nextURL != "" {
		if err := security.IsSafeURL(nextURL, security.DefaultAllowedHosts); err != nil {
			return nil, fmt.Errorf("disallowed pagination URL: %w", err)
		}
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		auth.SetAuthHeader(req)
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			return nil, fmt.Errorf("bitbucket cloud authorization failed for workspace '%s': %d (check credentials)", workspace, resp.StatusCode)
		}
		if resp.StatusCode == 404 {
			return nil, fmt.Errorf("bitbucket cloud workspace '%s' not found (404)", workspace)
		}
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read body: %w", err)
		}
		var result struct {
			Values []struct {
				Name     string `json:"name"`
				Slug     string `json:"slug"` // URL-safe repo identifier (always lowercase)
				FullName string `json:"full_name"`
				UUID     string `json:"uuid"`
				Owner    struct {
					DisplayName string `json:"display_name"`
					UUID        string `json:"uuid"`
				} `json:"owner"`
				Mainbranch struct {
					Name string `json:"name"`
				} `json:"mainbranch"`
			} `json:"values"`
			Next string `json:"next"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("unmarshal: %w", err)
		}
		// Convert to Repo structs
		for _, v := range result.Values {
			branch := v.Mainbranch.Name
			if branch == "" {
				branch = "main" // Default fallback
			}
			// Use slug instead of name to avoid case sensitivity issues
			// (Bitbucket's 'name' can have capitals, but 'slug' is always lowercase and URL-safe)
			repoName := v.Slug
			if repoName == "" {
				// Fallback: extract slug from full_name if slug field is missing
				parts := strings.Split(v.FullName, "/")
				if len(parts) == 2 {
					repoName = parts[1]
				} else {
					repoName = v.Name
				}
			}
			repos = append(repos, Repo{
				Name:     repoName,
				FullName: v.FullName,
				UUID:     v.UUID,
				Owner:    v.Owner,
				Branch:   branch,
			})
		}
		nextURL = result.Next
	}
	return repos, nil
}

// Workspace represents a Bitbucket Cloud workspace
type Workspace struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
	UUID string `json:"uuid"`
}

// FetchBitbucketCloudWorkspaces lists all workspaces accessible to the authenticated user.
// Note: This endpoint typically requires Basic Auth (username + app password).
// If auth is nil, it will attempt to get auth from environment.
// FetchBitbucketCloudWorkspacesWithClient lists all workspaces using the provided client.
// This version allows dependency injection for testing.
func FetchBitbucketCloudWorkspacesWithClient(ctx context.Context, client BitbucketClientInterface) ([]string, error) {
	if client == nil {
		return nil, fmt.Errorf("client is required")
	}

	workspacesData, err := client.FetchWorkspaces(ctx)
	if err != nil {
		return nil, err
	}

	var workspaces []string
	for _, ws := range workspacesData {
		if slug, ok := ws["slug"].(string); ok && slug != "" {
			workspaces = append(workspaces, slug)
		}
	}

	return workspaces, nil
}

func FetchBitbucketCloudWorkspaces(ctx context.Context, auth *BitbucketCloudAuth) ([]string, error) {
	if auth == nil {
		var err error
		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return nil, fmt.Errorf("get auth: %w", err)
		}
	}

	client, err := NewBitbucketClientWrapper(auth)
	if err != nil {
		return nil, fmt.Errorf("create client: %w", err)
	}

	return FetchBitbucketCloudWorkspacesWithClient(ctx, client)
}

// FetchBitbucketCloudRepoDefaultBranchWithClient fetches the default branch using the provided client.
// This version allows dependency injection for testing.
func FetchBitbucketCloudRepoDefaultBranchWithClient(ctx context.Context, client BitbucketClientInterface, workspace, repoSlug string) (string, error) {
	if client == nil {
		return "", fmt.Errorf("client is required")
	}

	return client.FetchDefaultBranch(ctx, workspace, repoSlug)
}

// FetchBitbucketCloudRepoDefaultBranch fetches the default branch name for a repo using auth
// This is the backward-compatible wrapper that creates a client internally.
func FetchBitbucketCloudRepoDefaultBranch(ctx context.Context, auth *BitbucketCloudAuth, workspace, repoSlug string) (string, error) {
	if auth == nil {
		var err error
		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return "", fmt.Errorf("get auth: %w", err)
		}
	}

	client, err := NewBitbucketClientWrapper(auth)
	if err != nil {
		return "", fmt.Errorf("create client: %w", err)
	}

	return FetchBitbucketCloudRepoDefaultBranchWithClient(ctx, client, workspace, repoSlug)
}

// FetchBitbucketCloudReposWithCache fetches all repos for a Bitbucket Cloud workspace with caching support.
// Returns repos, API call count, and error.
func FetchBitbucketCloudReposWithCache(ctx context.Context, auth *BitbucketCloudAuth, workspace string, manifestTypes []string, cache *ManifestCache) ([]map[string]string, int, error) {
	if auth == nil {
		var err error
		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return nil, 0, fmt.Errorf("get auth: %w", err)
		}
	}

	// Global throttle: minimum delay between API requests
	var lastRequestTime time.Time
	minDelay := 1200 * time.Millisecond
	throttle := func() {
		now := time.Now()
		if !lastRequestTime.IsZero() {
			since := now.Sub(lastRequestTime)
			if since < minDelay {
				time.Sleep(minDelay - since)
			}
		}
		lastRequestTime = time.Now()
	}

	base := "https://api.bitbucket.org/2.0"
	listURL := fmt.Sprintf("%s/repositories/%s", base, url.PathEscape(workspace))
	var repos []map[string]string
	nextURL := listURL
	page := 1
	client := security.NewClient()
	apiCalls := 0

	for nextURL != "" {
		if err := security.IsSafeURL(nextURL, security.DefaultAllowedHosts); err != nil {
			return nil, apiCalls, fmt.Errorf("disallowed pagination URL: %w", err)
		}

		throttle()
		apiCalls++
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, apiCalls, fmt.Errorf("create request: %w", err)
		}

		auth.SetAuthHeader(req)
		resp, err := client.Do(req)
		if err != nil {
			return nil, apiCalls, fmt.Errorf("http request: %w", err)
		}

		if resp.StatusCode != 200 {
			_ = resp.Body.Close()
			return nil, apiCalls, fmt.Errorf("unexpected status: %d", resp.StatusCode)
		}

		var result struct {
			Values []struct {
				Name  string `json:"name"`
				Owner struct {
					DisplayName string `json:"display_name"`
				} `json:"owner"`
			} `json:"values"`
			Next string `json:"next"`
		}

		body, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			return nil, apiCalls, fmt.Errorf("read body: %w", err)
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, apiCalls, fmt.Errorf("unmarshal: %w", err)
		}

		// Process each repo
		for _, r := range result.Values {
			Logger.Infof("Processing repo: %s/%s", workspace, r.Name)

			// Get default branch
			branch, err := FetchBitbucketCloudRepoDefaultBranch(ctx, auth, workspace, r.Name)
			if err != nil || branch == "" {
				Logger.Warnf("Could not get default branch for %s, using 'main': %v", r.Name, err)
				branch = "main"
			}
			Logger.Debugf("Repo %s default branch: %s", r.Name, branch)

			// Get commit hash for branch
			throttle()
			apiCalls++
			branchURL := fmt.Sprintf("%s/repositories/%s/%s/refs/branches/%s", base, url.PathEscape(workspace), url.PathEscape(r.Name), url.PathEscape(branch))
			branchReq, _ := http.NewRequestWithContext(ctx, "GET", branchURL, nil)
			auth.SetAuthHeader(branchReq)
			branchResp, branchErr := client.Do(branchReq)

			var commitHash string
			if branchErr == nil && branchResp != nil && branchResp.StatusCode == 200 {
				var branchData struct {
					Target struct {
						Hash string `json:"hash"`
					} `json:"target"`
				}
				branchBody, _ := io.ReadAll(branchResp.Body)
				_ = branchResp.Body.Close()
				if json.Unmarshal(branchBody, &branchData) == nil {
					commitHash = branchData.Target.Hash
				}
			} else if branchResp != nil {
				_ = branchResp.Body.Close()
			}

			if commitHash == "" {
				Logger.Warnf("No commit hash found for repo %s branch %s", r.Name, branch)
				continue
			}

			Logger.Debugf("Repo %s: commit hash = %s", r.Name, commitHash)

			// Check cache first
			cacheKey := fmt.Sprintf("%s/%s@%s", workspace, r.Name, branch)
			if cache != nil {
				if entry, found := cache.Get(workspace, r.Name, branch); found && entry.CommitSHA == commitHash {
					Logger.Infof("Cache HIT for %s (SHA: %s)", cacheKey, commitHash[:8])

					// Use cached data - get all files (SCA + IaC + Container)
					allFiles := entry.GetAllFiles()

					// Filter out lock files that aren't primary import targets
					var importableFiles []string
					for _, f := range allFiles {
						lowerFile := strings.ToLower(f)
						lowerBase := strings.ToLower(filepath.Base(f))
						// Exclude lock files that are dependency resolution artifacts, not primary manifests
						if !strings.HasSuffix(lowerFile, "-lock.json") &&
							!strings.HasSuffix(lowerFile, ".lock") &&
							!strings.HasSuffix(lowerFile, "lockfile") &&
							lowerBase != "go.sum" {
							importableFiles = append(importableFiles, f)
						}
					}

					if len(importableFiles) > 0 {
						for _, mf := range importableFiles {
							repos = append(repos, map[string]string{
								"name":     r.Name,
								"owner":    workspace,
								"branch":   branch,
								"manifest": mf,
							})
						}
					}
					// If no importable files, skip this repo (don't add empty manifest entry)
					continue
				}
				Logger.Infof("Cache MISS for %s (SHA: %s)", cacheKey, commitHash[:8])
			}

			// Cache miss - discover manifests using max_depth parameter (optimized)
			var scaFiles, iacFiles, containerFiles []string
			var filesChecked int

			// Directories to skip (client-side filtering)
			skipDirs := map[string]bool{
				"node_modules":  true,
				".git":          true,
				"vendor":        true,
				"dist":          true,
				"build":         true,
				"target":        true,
				"bin":           true,
				"obj":           true,
				".idea":         true,
				".vscode":       true,
				"examples":      true,
				"coverage":      true,
				"tmp":           true,
				"temp":          true,
				"cache":         true,
				"logs":          true,
				"test":          true,
				"tests":         true,
				"fixtures":      true,
				"__tests__":     true,
				"spec":          true,
				".github":       true,
				".gitlab":       true,
				"__pycache__":   true,
				".pytest_cache": true,
				".terraform":    true,
			}

			// Helper function to check if a path contains excluded directories
			containsExcludedDir := func(path string, skipDirs map[string]bool) bool {
				parts := strings.Split(path, "/")
				for _, part := range parts {
					if skipDirs[part] {
						return true
					}
				}
				return false
			}

			// Use max_depth parameter for single API call (optimized approach)
			// Also use pagelen=100 to reduce pagination calls (max allowed by Bitbucket API)
			maxDepth := 10
			filesURL := fmt.Sprintf("%s/repositories/%s/%s/src/%s/?max_depth=%d&pagelen=100",
				base,
				url.PathEscape(workspace),
				url.PathEscape(r.Name),
				url.PathEscape(commitHash),
				maxDepth,
			)
			Logger.Debugf("Repo %s: using optimized max_depth API with pagelen=100: %s", r.Name, filesURL)

			nextFilesURL := filesURL
			for nextFilesURL != "" {
				if err := security.IsSafeURL(nextFilesURL, security.DefaultAllowedHosts); err != nil {
					Logger.Warnf("Unsafe files URL: %v", err)
					break
				}

				throttle()
				apiCalls++
				filesReq, _ := http.NewRequestWithContext(ctx, "GET", nextFilesURL, nil)
				auth.SetAuthHeader(filesReq)
				filesResp, filesErr := client.Do(filesReq)

				if filesErr != nil || filesResp == nil {
					Logger.Warnf("Repo %s: files API error: %v", r.Name, filesErr)
					if filesResp != nil {
						_ = filesResp.Body.Close()
					}
					break
				}

				// Handle timeout error (555) by retrying with smaller max_depth
				if filesResp.StatusCode == 555 {
					_ = filesResp.Body.Close()
					if maxDepth > 5 {
						Logger.Warnf("Repo %s: max_depth=%d too large (555 timeout), retrying with max_depth=5", r.Name, maxDepth)
						maxDepth = 5
						filesURL = fmt.Sprintf("%s/repositories/%s/%s/src/%s/?max_depth=%d&pagelen=100",
							base,
							url.PathEscape(workspace),
							url.PathEscape(r.Name),
							url.PathEscape(commitHash),
							maxDepth,
						)
						nextFilesURL = filesURL
						continue
					} else {
						Logger.Warnf("Repo %s: max_depth=5 still timing out, skipping", r.Name)
						break
					}
				}

				if filesResp.StatusCode != 200 {
					errorBody, _ := io.ReadAll(filesResp.Body)
					_ = filesResp.Body.Close()
					Logger.Warnf("Repo %s: files API returned status %d", r.Name, filesResp.StatusCode)
					Logger.Warnf("Repo %s: URL was: %s", r.Name, nextFilesURL)
					if len(errorBody) > 0 && len(errorBody) < 1000 {
						Logger.Warnf("Repo %s: Error response: %s", r.Name, string(errorBody))
					}
					break
				}

				var filesResult struct {
					Values []struct {
						Path string `json:"path"`
						Type string `json:"type"`
					} `json:"values"`
					Next string `json:"next"`
				}

				filesBody, _ := io.ReadAll(filesResp.Body)
				_ = filesResp.Body.Close()

				if unmarshalErr := json.Unmarshal(filesBody, &filesResult); unmarshalErr == nil {
					Logger.Debugf("Repo %s: received %d entries from max_depth API", r.Name, len(filesResult.Values))
					for _, f := range filesResult.Values {
						// Only process files, not directories
						if f.Type != "commit_file" {
							continue
						}

						filesChecked++

						// Skip files in excluded directories (client-side filtering)
						if containsExcludedDir(f.Path, skipDirs) {
							Logger.Debugf("Repo %s: skipping file %s (in excluded directory)", r.Name, f.Path)
							continue
						}

						// Classify file by type (using shared functions from sync_helpers.go)
						if isSCAFile(f.Path) {
							scaFiles = append(scaFiles, f.Path)
							Logger.Debugf("Repo %s: SCA file %s", r.Name, f.Path)
						} else if isIaCFile(f.Path) {
							iacFiles = append(iacFiles, f.Path)
							Logger.Debugf("Repo %s: IaC file %s", r.Name, f.Path)
						} else if isContainerFile(f.Path) {
							containerFiles = append(containerFiles, f.Path)
							Logger.Debugf("Repo %s: Container file %s", r.Name, f.Path)
						}
					}

					// Follow pagination
					if filesResult.Next != "" && isAllowedNextURL(filesResult.Next, "api.bitbucket.org") {
						nextFilesURL = filesResult.Next
					} else {
						nextFilesURL = ""
					}
				} else {
					Logger.Warnf("Repo %s: failed to unmarshal files response: %v", r.Name, unmarshalErr)
					maxLen := 500
					if len(filesBody) < maxLen {
						maxLen = len(filesBody)
					}
					Logger.Debugf("Response body (first %d chars): %s", maxLen, string(filesBody[:maxLen]))
					nextFilesURL = ""
				}
			}

			Logger.Infof("Repo %s: checked %d files, found %d SCA, %d IaC, %d Container",
				r.Name, filesChecked, len(scaFiles), len(iacFiles), len(containerFiles))

			// Save to cache
			if cache != nil {
				cache.SetEntry(workspace, r.Name, branch, CachedRepoEntry{
					Owner:           workspace,
					Repo:            r.Name,
					Branch:          branch,
					CommitSHA:       commitHash,
					TreeSHA:         commitHash, // Bitbucket doesn't have separate tree SHA
					SCAFiles:        scaFiles,
					IaCFiles:        iacFiles,
					ContainerFiles:  containerFiles,
					DiscoveryMethod: "bitbucket-max-depth",
					LastChecked:     time.Now(),
					CheckCount:      1,
					APICalls:        apiCalls,
				})
			}

			// Add repo entries - get all files (SCA + IaC + Container)
			allFiles := append(append(scaFiles, iacFiles...), containerFiles...)

			// Filter out lock files that aren't primary import targets
			var importableFiles []string
			for _, f := range allFiles {
				lowerFile := strings.ToLower(f)
				lowerBase := strings.ToLower(filepath.Base(f))
				// Exclude lock files that are dependency resolution artifacts, not primary manifests
				if !strings.HasSuffix(lowerFile, "-lock.json") &&
					!strings.HasSuffix(lowerFile, ".lock") &&
					!strings.HasSuffix(lowerFile, "lockfile") &&
					lowerBase != "go.sum" {
					importableFiles = append(importableFiles, f)
				}
			}

			if len(importableFiles) > 0 {
				for _, mf := range importableFiles {
					repos = append(repos, map[string]string{
						"name":     r.Name,
						"owner":    workspace,
						"branch":   branch,
						"manifest": mf,
					})
				}
			} else {
				Logger.Debugf("No manifests found for repo '%s' (branch=%s), skipping", r.Name, branch)
				// Skip repos with no manifests (don't add empty manifest entry)
			}
		}

		// Follow pagination for repo list
		if result.Next != "" && isAllowedNextURL(result.Next, "api.bitbucket.org") {
			nextURL = result.Next
		} else {
			nextURL = ""
		}
		page++
	}

	return repos, apiCalls, nil
}

// FetchBitbucketCloudRepos fetches all repos for a Bitbucket Cloud workspace, including manifest file discovery.
// This mirrors the behavior of FetchBitbucketCloudAppRepos but uses the Bitbucket Cloud auth system.
func FetchBitbucketCloudRepos(ctx context.Context, auth *BitbucketCloudAuth, workspace string, manifestTypes []string) ([]map[string]string, error) {
	if auth == nil {
		var err error
		auth, err = GetBitbucketCloudAuth()
		if err != nil {
			return nil, fmt.Errorf("get auth: %w", err)
		}
	}

	// Global throttle: minimum delay between API requests
	var lastRequestTime time.Time
	minDelay := 1200 * time.Millisecond
	throttle := func() {
		now := time.Now()
		if !lastRequestTime.IsZero() {
			since := now.Sub(lastRequestTime)
			if since < minDelay {
				time.Sleep(minDelay - since)
			}
		}
		lastRequestTime = time.Now()
	}

	base := "https://api.bitbucket.org/2.0"
	listURL := fmt.Sprintf("%s/repositories/%s", base, url.PathEscape(workspace))
	var repos []map[string]string
	nextURL := listURL
	page := 1
	client := security.NewClient()

	for nextURL != "" {
		if err := security.IsSafeURL(nextURL, security.DefaultAllowedHosts); err != nil {
			return nil, fmt.Errorf("disallowed pagination URL: %w", err)
		}

		throttle()
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		auth.SetAuthHeader(req)
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}

		if resp.StatusCode != 200 {
			_ = resp.Body.Close()
			return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
		}

		var result struct {
			Values []struct {
				Name  string `json:"name"`
				Owner struct {
					DisplayName string `json:"display_name"`
				} `json:"owner"`
			} `json:"values"`
			Next string `json:"next"`
		}

		body, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("read body: %w", err)
		}

		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("unmarshal: %w", err)
		}

		// Process each repo: get default branch and discover manifests
		for _, r := range result.Values {
			Logger.Infof("Processing repo: %s/%s", workspace, r.Name)

			// Get default branch
			branch, err := FetchBitbucketCloudRepoDefaultBranch(ctx, auth, workspace, r.Name)
			if err != nil || branch == "" {
				Logger.Warnf("Could not get default branch for %s, using 'main': %v", r.Name, err)
				branch = "main"
			}
			Logger.Debugf("Repo %s default branch: %s", r.Name, branch)

			// Get commit hash for branch
			throttle()
			branchURL := fmt.Sprintf("%s/repositories/%s/%s/refs/branches/%s", base, url.PathEscape(workspace), url.PathEscape(r.Name), url.PathEscape(branch))
			branchReq, _ := http.NewRequestWithContext(ctx, "GET", branchURL, nil)
			auth.SetAuthHeader(branchReq)
			branchResp, branchErr := client.Do(branchReq)

			var commitHash string
			if branchErr == nil && branchResp != nil && branchResp.StatusCode == 200 {
				var branchData struct {
					Target struct {
						Hash string `json:"hash"`
					} `json:"target"`
				}
				branchBody, _ := io.ReadAll(branchResp.Body)
				_ = branchResp.Body.Close()
				if json.Unmarshal(branchBody, &branchData) == nil {
					commitHash = branchData.Target.Hash
				}
			} else if branchResp != nil {
				_ = branchResp.Body.Close()
			}

			if commitHash == "" {
				Logger.Warnf("No commit hash found for repo %s branch %s", r.Name, branch)
				continue
			}

			Logger.Debugf("Repo %s: commit hash = %s", r.Name, commitHash)

			// Discover manifest files by traversing the repository
			var manifests []string
			var filesChecked int
			const maxDepth = 5 // Limit traversal depth to avoid deep nested directories

			// Directories to skip (common dirs that rarely contain manifest files)
			skipDirs := map[string]bool{
				"node_modules":  true,
				".git":          true,
				"vendor":        true,
				"dist":          true,
				"build":         true,
				"target":        true,
				"bin":           true,
				"obj":           true,
				".idea":         true,
				".vscode":       true,
				"examples":      true,
				"coverage":      true,
				"tmp":           true,
				"temp":          true,
				"cache":         true,
				"logs":          true,
				"test":          true, // Skip test directories
				"tests":         true, // Skip tests directories
				"fixtures":      true, // Skip fixture directories
				"__tests__":     true, // Skip Jest test directories
				"spec":          true, // Skip spec directories
				".github":       true, // Skip GitHub workflows
				".gitlab":       true, // Skip GitLab CI
				"__pycache__":   true, // Skip Python cache
				".pytest_cache": true, // Skip pytest cache
				".terraform":    true, // Skip Terraform state
			}

			var traverse func(path string, depth int)
			traverse = func(path string, depth int) {
				if depth > maxDepth {
					Logger.Debugf("Skipping path '%s' in repo %s: max depth %d reached", path, r.Name, maxDepth)
					return
				}
				Logger.Debugf("traverse(%s, depth=%d) called for repo %s", path, depth, r.Name)
				// Escape each path segment separately (critical for subdirectories!)
				escPath := escapePathSegments(path)
				filesURL := fmt.Sprintf("%s/repositories/%s/%s/src/%s/%s", base, url.PathEscape(workspace), url.PathEscape(r.Name), url.PathEscape(commitHash), escPath)
				if path == "" {
					// Add trailing slash for root directory listing
					filesURL = fmt.Sprintf("%s/repositories/%s/%s/src/%s/", base, url.PathEscape(workspace), url.PathEscape(r.Name), url.PathEscape(commitHash))
				}
				Logger.Debugf("Repo %s: filesURL = %s", r.Name, filesURL)

				nextFilesURL := filesURL
				for nextFilesURL != "" {
					if err := security.IsSafeURL(nextFilesURL, security.DefaultAllowedHosts); err != nil {
						Logger.Warnf("Unsafe files URL: %v", err)
						break
					}

					throttle()
					filesReq, _ := http.NewRequestWithContext(ctx, "GET", nextFilesURL, nil)
					auth.SetAuthHeader(filesReq)
					filesResp, filesErr := client.Do(filesReq)

					if filesErr != nil || filesResp == nil {
						Logger.Warnf("Repo %s: files API error: %v", r.Name, filesErr)
						if filesResp != nil {
							_ = filesResp.Body.Close()
						}
						break
					}

					if filesResp.StatusCode != 200 {
						// Read error response body for debugging
						errorBody, _ := io.ReadAll(filesResp.Body)
						_ = filesResp.Body.Close()
						Logger.Warnf("Repo %s: files API returned status %d for path '%s'", r.Name, filesResp.StatusCode, path)
						Logger.Warnf("Repo %s: URL was: %s", r.Name, nextFilesURL)
						if len(errorBody) > 0 && len(errorBody) < 1000 {
							Logger.Warnf("Repo %s: Error response: %s", r.Name, string(errorBody))
						}
						break
					}

					var filesResult struct {
						Values []struct {
							Path string `json:"path"`
							Type string `json:"type"`
						} `json:"values"`
						Next string `json:"next"`
					}

					filesBody, _ := io.ReadAll(filesResp.Body)
					_ = filesResp.Body.Close()

					if unmarshalErr := json.Unmarshal(filesBody, &filesResult); unmarshalErr == nil {
						Logger.Debugf("Repo %s path '%s': found %d entries", r.Name, path, len(filesResult.Values))
						for _, f := range filesResult.Values {
							filesChecked++
							// Check if file matches any manifest pattern
							matched := false
							for _, mt := range manifestTypes {
								if matchManifest(f.Path, mt) {
									manifests = append(manifests, f.Path)
									Logger.Infof("Repo %s: MATCHED manifest %s (pattern: %s)", r.Name, f.Path, mt)
									matched = true
									break
								}
							}

							// Recurse into directories (but skip common non-manifest directories)
							if f.Type == "commit_directory" {
								// Check if any part of the path contains an excluded directory
								shouldSkip := false
								parts := strings.Split(f.Path, "/")
								for _, part := range parts {
									if skipDirs[part] {
										shouldSkip = true
										break
									}
								}

								if shouldSkip {
									Logger.Debugf("Repo %s: skipping directory %s (contains excluded dir)", r.Name, f.Path)
								} else {
									Logger.Debugf("Repo %s: recursing into directory %s", r.Name, f.Path)
									traverse(f.Path, depth+1)
								}
							} else if !matched && filesChecked <= 10 {
								// Log first few non-matching files for debugging
								Logger.Debugf("Repo %s: file %s (type: %s) - no match", r.Name, f.Path, f.Type)
							}
						}

						// Follow pagination
						if filesResult.Next != "" && isAllowedNextURL(filesResult.Next, "api.bitbucket.org") {
							nextFilesURL = filesResult.Next
						} else {
							nextFilesURL = ""
						}
					} else {
						Logger.Warnf("Repo %s: failed to unmarshal files response for path '%s': %v", r.Name, path, unmarshalErr)
						maxLen := 500
						if len(filesBody) < maxLen {
							maxLen = len(filesBody)
						}
						Logger.Debugf("Response body (first %d chars): %s", maxLen, string(filesBody[:maxLen]))
						nextFilesURL = ""
					}
				}
			}

			traverse("", 0)

			Logger.Infof("Repo %s: checked %d files, found %d manifests", r.Name, filesChecked, len(manifests))

			// Add repo entries: one per manifest found, or one with empty manifest if none found
			if len(manifests) > 0 {
				for _, mf := range manifests {
					Logger.Infof("  - manifest: %s", mf)
					repos = append(repos, map[string]string{
						"name":     r.Name,
						"owner":    r.Owner.DisplayName,
						"branch":   branch,
						"manifest": mf,
					})
				}
			} else {
				Logger.Debugf("No manifests found for repo '%s' (branch=%s), skipping", r.Name, branch)
				// Skip repos with no manifests (don't add empty manifest entry)
			}
		}

		// Follow pagination for repo list
		if result.Next != "" && isAllowedNextURL(result.Next, "api.bitbucket.org") {
			nextURL = result.Next
		} else {
			nextURL = ""
		}
		page++
	}

	return repos, nil
}

// matchManifest checks if a file path matches a manifest pattern using glob matching
func matchManifest(path, pattern string) bool {
	// Try matching full path
	if matched, _ := doublestar.Match(pattern, path); matched {
		return true
	}

	// Try matching filename only
	filename := path
	if idx := strings.LastIndex(path, "/"); idx != -1 {
		filename = path[idx+1:]
	}
	if matched, _ := doublestar.Match(pattern, filename); matched {
		return true
	}

	// Try exact match
	if path == pattern || filename == pattern {
		return true
	}

	return false
}
