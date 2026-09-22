package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/snyk/snyk-api-import/internal/network"
)

// AssetsAPIVersion is pinned on every Assets API request, matching the
// version snyk-labs/asset-tagger pins (internal/snyk/assets.go). Phase 0
// found the gateway silently serves 2025-09-28~beta for this pinned version
// rather than erroring; per product decision this is not a concern, so the
// version stays pinned here rather than changed to match what's served.
const AssetsAPIVersion = "2026-03-25"

const defaultAssetsPageLimit = 100 // Phase 0 confirmed the API's own max page size.

// RepositoryAsset is the subset of a Snyk Assets API repository asset this
// tool needs. Field presence was verified empirically in Phase 0 across a
// 100-asset sample: default_branch_name, repository_url and name were
// present on 100/100; there is no dedicated SCM-owner field, so callers must
// parse it out of RepositoryURL.
type RepositoryAsset struct {
	ID                string
	Sources           []string
	Name              string
	RepositoryURL     string
	DefaultBranchName string
	Tags              map[string]string
}

// assetSearchResponse mirrors the JSON:API shape returned by
// POST /rest/groups/{group_id}/assets/search.
type assetSearchResponse struct {
	Data []struct {
		ID         string `json:"id"`
		Type       string `json:"type"`
		Attributes struct {
			Sources           []string          `json:"sources"`
			Name              string            `json:"name"`
			RepositoryURL     string            `json:"repository_url"`
			DefaultBranchName string            `json:"default_branch_name"`
			Tags              map[string]string `json:"tags"`
		} `json:"attributes"`
	} `json:"data"`
	Links struct {
		Next string `json:"next"`
	} `json:"links"`
}

// snykAPIToken returns the configured Snyk API token, checking SNYK_TOKEN
// then the legacy SNYK_API_TOKEN name, matching every other client in this
// package.
func snykAPIToken() (string, error) {
	if t := os.Getenv("SNYK_TOKEN"); t != "" {
		return t, nil
	}
	if t := os.Getenv("SNYK_API_TOKEN"); t != "" {
		return t, nil
	}
	return "", fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set")
}

// SearchRepositoryAssets returns every repository-type asset in the given
// Group, filtering server-side on type == "repository" (confirmed working in
// Phase 0) and paginating via the cursor-based starting_after link until
// exhausted.
func SearchRepositoryAssets(ctx context.Context, groupID string) ([]RepositoryAsset, error) {
	if groupID == "" {
		return nil, fmt.Errorf("groupID cannot be empty")
	}
	token, err := snykAPIToken()
	if err != nil {
		return nil, err
	}

	baseURL := GetSnykAPIBaseURL()
	client := network.NewClient()

	reqBody := map[string]any{
		"query": map[string]any{
			"attributes": map[string]any{
				"attribute": "type",
				"operator":  "equal",
				"values":    []string{"repository"},
			},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal search body: %w", err)
	}

	var assets []RepositoryAsset
	nextPath := fmt.Sprintf("/rest/groups/%s/assets/search?limit=%d&version=%s",
		url.PathEscape(groupID), defaultAssetsPageLimit, url.QueryEscape(AssetsAPIVersion))

	for nextPath != "" {
		apiURL := baseURL + nextPath
		if !IsValidSnykAPIURL(apiURL) {
			return nil, fmt.Errorf("invalid API URL: %s", apiURL)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, fmt.Errorf("build search request: %w", err)
		}
		req.Header.Set("Authorization", "token "+token)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, respBody, err := DoWithRetry(ctx, client, req)
		if err != nil {
			return nil, fmt.Errorf("search assets: %w", err)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("search assets: unexpected status %d: %s", resp.StatusCode, string(respBody))
		}

		var parsed assetSearchResponse
		if err := json.Unmarshal(respBody, &parsed); err != nil {
			return nil, fmt.Errorf("decode search response: %w", err)
		}

		for _, d := range parsed.Data {
			assets = append(assets, RepositoryAsset{
				ID:                d.ID,
				Sources:           d.Attributes.Sources,
				Name:              d.Attributes.Name,
				RepositoryURL:     d.Attributes.RepositoryURL,
				DefaultBranchName: d.Attributes.DefaultBranchName,
				Tags:              d.Attributes.Tags,
			})
		}

		nextPath = parsed.Links.Next
	}

	return assets, nil
}

// UpdateAssetTags adds the given tags to an asset via a single PATCH, using
// the exact request shape confirmed against the live Assets API in Phase 0
// (and matching snyk-labs/asset-tagger's own UpdateAssetTags). The Assets
// API offers no bulk tag update, so this is one request per asset.
func UpdateAssetTags(ctx context.Context, groupID, assetID string, add map[string]string) error {
	if groupID == "" {
		return fmt.Errorf("groupID cannot be empty")
	}
	if assetID == "" {
		return fmt.Errorf("assetID cannot be empty")
	}
	if len(add) == 0 {
		return fmt.Errorf("an update with no tag changes would be a request for nothing")
	}
	token, err := snykAPIToken()
	if err != nil {
		return err
	}

	body := map[string]any{
		"data": map[string]any{
			"id":         assetID,
			"type":       "repository",
			"attributes": map[string]any{"tags": map[string]any{"add": add}},
		},
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal tag update body: %w", err)
	}

	baseURL := GetSnykAPIBaseURL()
	apiURL := fmt.Sprintf("%s/rest/groups/%s/assets/%s?version=%s",
		baseURL, url.PathEscape(groupID), url.PathEscape(assetID), url.QueryEscape(AssetsAPIVersion))
	if !IsValidSnykAPIURL(apiURL) {
		return fmt.Errorf("invalid API URL: %s", apiURL)
	}

	client := network.NewClient()
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("build tag update request: %w", err)
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Content-Type", "application/vnd.api+json")
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, respBody, err := DoWithRetry(ctx, client, req)
	if err != nil {
		return fmt.Errorf("update asset tags: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("update asset tags: unexpected status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// ParseGitHubOwnerRepo extracts the owner and repository name from a
// github.com repository URL, e.g. https://github.com/{owner}/{repo}. This is
// parsing of data the Assets API already returned, not a call to GitHub: the
// invariant this tool is built to (read/write Snyk only) allows it. Returns
// ok == false for any URL that isn't a github.com repository URL, which
// includes every non-GitHub provider by design (this build is GitHub-only).
func ParseGitHubOwnerRepo(repositoryURL string) (owner, repo string, ok bool) {
	u, err := url.Parse(strings.TrimSpace(repositoryURL))
	if err != nil || u.Host == "" {
		return "", "", false
	}
	if !strings.EqualFold(u.Host, "github.com") {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	name := strings.TrimSuffix(parts[1], ".git")
	if name == "" {
		return "", "", false
	}
	return parts[0], name, true
}
