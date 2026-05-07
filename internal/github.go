package internal

import (
	"context"
	"fmt"
	"os"

	"github.com/google/go-github/v57/github"
)

// GitHubAuth holds GitHub authentication configuration using Personal Access Token
type GitHubAuth struct {
	Token   string
	BaseURL string // Optional, for GitHub Enterprise
}

// GetGitHubAuth retrieves GitHub authentication from environment variables
func GetGitHubAuth() (GitHubAuth, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return GitHubAuth{}, fmt.Errorf("GITHUB_TOKEN environment variable is required. Please set it to your personal access token")
	}

	// Default to GitHub.com API, but allow override for GitHub Enterprise
	baseURL := os.Getenv("GITHUB_API_URL")
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}

	return GitHubAuth{
		Token:   token,
		BaseURL: baseURL,
	}, nil
}

// GitHubOrg represents a GitHub organization
type GitHubOrg struct {
	Name string
	ID   int64
	URL  string
}

// FetchGitHubOrgs fetches all GitHub organizations accessible to the authenticated user
func FetchGitHubOrgs(ctx context.Context, auth GitHubAuth) ([]GitHubOrg, error) {
	client, err := NewGitHubClientWrapper(ctx, auth)
	if err != nil {
		return nil, err
	}
	return FetchGitHubOrgsWithClient(ctx, client, auth.BaseURL)
}

// FetchGitHubOrgsWithClient fetches GitHub organizations using the provided client.
// This function is designed for testability via dependency injection.
func FetchGitHubOrgsWithClient(ctx context.Context, client GitHubClientInterface, baseURL string) ([]GitHubOrg, error) {
	var allOrgs []GitHubOrg
	opts := &github.ListOptions{PerPage: 100}

	// Determine if this is GitHub Enterprise based on custom baseURL
	isEnterprise := baseURL != "" && baseURL != "https://api.github.com"

	for {
		var orgs []*github.Organization
		var resp *github.Response
		var err error

		if isEnterprise {
			// GitHub Enterprise: list all orgs (requires site admin)
			orgs, resp, err = client.ListAllOrganizations(ctx, &github.OrganizationsListOptions{
				ListOptions: *opts,
			})
		} else {
			// GitHub.com: list orgs for authenticated user
			orgs, resp, err = client.ListOrganizations(ctx, "", opts)
		}

		if err != nil {
			return nil, fmt.Errorf("list organizations: %w", err)
		}

		for _, org := range orgs {
			if org.Login == nil || org.ID == nil {
				continue
			}

			allOrgs = append(allOrgs, GitHubOrg{
				Name: *org.Login,
				ID:   *org.ID,
				URL:  getStringValue(org.URL),
			})
		}

		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}

	return allOrgs, nil
}

// FetchGitHubRepos fetches all repositories for a GitHub organization
func FetchGitHubRepos(ctx context.Context, auth GitHubAuth, orgName string, manifestTypes []string) ([]map[string]string, error) {
	if orgName == "" {
		return nil, fmt.Errorf("orgName is required")
	}

	client, err := NewGitHubClientWrapper(ctx, auth)
	if err != nil {
		return nil, err
	}
	return FetchGitHubReposWithClient(ctx, client, orgName)
}

// FetchGitHubReposWithClient fetches repositories using the provided client.
// This function is designed for testability via dependency injection.
func FetchGitHubReposWithClient(ctx context.Context, client GitHubClientInterface, orgName string) ([]map[string]string, error) {
	if orgName == "" {
		return nil, fmt.Errorf("orgName is required")
	}

	var allRepos []map[string]string
	opts := &github.RepositoryListByOrgOptions{
		Type:        "all",
		ListOptions: github.ListOptions{PerPage: 100},
	}

	for {
		repos, resp, err := client.ListRepositories(ctx, orgName, opts)
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
	}

	Logger.Infof("Fetched %d repositories for org %s", len(allRepos), orgName)
	return allRepos, nil
}

// getStringValue safely returns the value of a string pointer or empty string if nil
func getStringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
