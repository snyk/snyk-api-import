package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/snyk/snyk-api-import/internal/security"
)

// FetchBitbucketRepoDefaultBranch fetches the default branch name for a repo.
// This is a thin wrapper around FetchBitbucketCloudRepoDefaultBranch that uses OAuth token auth.
func FetchBitbucketRepoDefaultBranch(ctx context.Context, token, workspace, repoSlug string) (string, error) {
	auth := &BitbucketCloudAuth{
		Method: "token",
		Token:  token,
	}
	return FetchBitbucketCloudRepoDefaultBranch(ctx, auth, workspace, repoSlug)
}

// FetchBitbucketAppWorkspaces lists all workspace slugs for the authenticated app user.
// This is a thin wrapper around FetchBitbucketCloudWorkspaces that uses OAuth token auth.
func FetchBitbucketAppWorkspaces(ctx context.Context, token string) ([]string, error) {
	auth := &BitbucketCloudAuth{
		Method: "token",
		Token:  token,
	}
	return FetchBitbucketCloudWorkspaces(ctx, auth)
}

type BitbucketAppRepo struct {
	Name     string `json:"name"`
	FullName string `json:"full_name"`
	UUID     string `json:"uuid"`
	Owner    struct {
		DisplayName string `json:"display_name"`
		UUID        string `json:"uuid"`
	} `json:"owner"`
	Branch string `json:"branch"`
}

// FetchBitbucketAppToken gets an app token using client ID/secret
func FetchBitbucketAppToken(ctx context.Context, clientID, clientSecret string) (string, error) {
	url := "https://bitbucket.org/site/oauth2/access_token"
	data := "grant_type=client_credentials"
	req, err := http.NewRequestWithContext(ctx, "POST", url, io.NopCloser(strings.NewReader(data)))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.SetBasicAuth(clientID, clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := security.NewClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			Logger.Errorf("Failed to close response body: %v", err)
		}
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != 200 {
		// Include response body to aid test diagnostics (often Bitbucket returns JSON with error details)
		return "", fmt.Errorf("unexpected status: %s; body: %s", resp.Status, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("unmarshal: %w; body: %s", err, string(body))
	}
	return result.AccessToken, nil
}

// FetchBitbucketAppRepos lists repos for a workspace using app token
// FetchBitbucketAppRepos fetches repositories for a workspace using OAuth token auth.
// This is a thin wrapper around FetchRepos that uses OAuth token auth.
func FetchBitbucketAppRepos(ctx context.Context, token, workspace string) ([]BitbucketAppRepo, error) {
	auth := &BitbucketCloudAuth{
		Method: "token",
		Token:  token,
	}

	repos, err := FetchRepos(ctx, auth, workspace)
	if err != nil {
		return nil, err
	}

	// Convert Repo to BitbucketAppRepo (they have identical structure)
	appRepos := make([]BitbucketAppRepo, len(repos))
	for i, repo := range repos {
		appRepos[i] = BitbucketAppRepo(repo)
	}

	return appRepos, nil
}
