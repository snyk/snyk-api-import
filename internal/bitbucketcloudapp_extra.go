package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/sam1el/snyk-api-import-go/internal/security"
)

type BitbucketWorkspace struct {
	UUID        string `json:"uuid"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
}

type BitbucketRepoMetadata struct {
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	UUID        string `json:"uuid"`
	Description string `json:"description"`
	IsPrivate   bool   `json:"is_private"`
	Links       struct {
		HTML struct {
			Href string `json:"href"`
		} `json:"html"`
	} `json:"links"`
}

// ListBitbucketAppWorkspaces lists workspaces for the OAuth token (Bitbucket Cloud App / bearer).
// Uses GET /2.0/user/workspaces (GET /2.0/workspaces is deprecated — CHANGE-2770).
// If that fails (e.g. client_credentials), falls back to BITBUCKET_CLOUD_DEFAULT_WORKSPACE,
// BITBUCKET_WORKSPACE, or BITBUCKET_APP_TEST_WORKSPACE when set.
func ListBitbucketAppWorkspaces(ctx context.Context, token string) ([]BitbucketWorkspace, error) {
	const base = "https://api.bitbucket.org/2.0"
	client := security.NewClient()
	setAuth := func(req *http.Request) {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	maps, err := fetchBitbucketUserWorkspaces(ctx, base, setAuth, client)
	if err != nil {
		if slug := bitbucketWorkspaceSlugFromEnv(); slug != "" {
			Logger.Warnf("Bitbucket app workspace list failed (%v); using workspace %q from environment", err, slug)
			return []BitbucketWorkspace{{Slug: slug, Name: slug}}, nil
		}
		return nil, err
	}

	out := make([]BitbucketWorkspace, 0, len(maps))
	for _, m := range maps {
		slug, _ := m["slug"].(string)
		if slug == "" {
			continue
		}
		name, _ := m["name"].(string)
		uuid, _ := m["uuid"].(string)
		out = append(out, BitbucketWorkspace{Slug: slug, Name: name, UUID: uuid})
	}
	if len(out) == 0 {
		if slug := bitbucketWorkspaceSlugFromEnv(); slug != "" {
			Logger.Warnf("Bitbucket app workspace list was empty; using workspace %q from environment", slug)
			return []BitbucketWorkspace{{Slug: slug, Name: slug}}, nil
		}
	}
	return out, nil
}

// GetBitbucketAppRepoMetadata fetches metadata for a specific repo
func GetBitbucketAppRepoMetadata(ctx context.Context, token, workspace, repoSlug string) (*BitbucketRepoMetadata, error) {
	url := fmt.Sprintf("https://api.bitbucket.org/2.0/repositories/%s/%s", workspace, repoSlug)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("unexpected status: %s", resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	var meta BitbucketRepoMetadata
	if err := json.Unmarshal(body, &meta); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &meta, nil
}

// IsBitbucketAppConfigured checks if required env vars are set
func IsBitbucketAppConfigured() bool {
	return GetEnv("BITBUCKET_APP_CLIENT_ID") != "" && GetEnv("BITBUCKET_APP_CLIENT_SECRET") != ""
}
