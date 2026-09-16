package internal

import (
	"context"
	"net/http"

	"github.com/snyk/snyk-api-import/internal/security"
)

type BitbucketWorkspace struct {
	UUID        string `json:"uuid"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
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
