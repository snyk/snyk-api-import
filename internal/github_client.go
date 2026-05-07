package internal

import (
	"context"
	"errors"

	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"
)

var (
	// ErrGitHubMissingToken is returned when GitHub token is not provided
	ErrGitHubMissingToken = errors.New("GitHub token is required")
)

// GitHubClientInterface defines the methods we need from the GitHub client.
// This interface allows us to mock the GitHub API for testing.
type GitHubClientInterface interface {
	// ListOrganizations lists all organizations for the authenticated user (GitHub.com)
	ListOrganizations(ctx context.Context, user string, opts *github.ListOptions) ([]*github.Organization, *github.Response, error)

	// ListAllOrganizations lists all organizations (GitHub Enterprise)
	ListAllOrganizations(ctx context.Context, opts *github.OrganizationsListOptions) ([]*github.Organization, *github.Response, error)

	// ListRepositories lists all repositories for an organization
	ListRepositories(ctx context.Context, org string, opts *github.RepositoryListByOrgOptions) ([]*github.Repository, *github.Response, error)
}

// gitHubClientImpl wraps the real GitHub client to implement our interface
type gitHubClientImpl struct {
	client *github.Client
}

// NewGitHubClientWrapper creates a new GitHub client wrapper
func NewGitHubClientWrapper(ctx context.Context, auth GitHubAuth) (GitHubClientInterface, error) {
	if auth.Token == "" {
		return nil, ErrGitHubMissingToken
	}

	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: auth.Token},
	)
	tc := oauth2.NewClient(ctx, ts)

	var client *github.Client
	var err error

	// Handle GitHub Enterprise if base URL is provided
	if auth.BaseURL != "" && auth.BaseURL != "https://api.github.com" {
		client, err = github.NewClient(tc).WithEnterpriseURLs(auth.BaseURL, auth.BaseURL)
		if err != nil {
			return nil, err
		}
	} else {
		client = github.NewClient(tc)
	}

	return &gitHubClientImpl{client: client}, nil
}

// ListOrganizations implements GitHubClientInterface
func (g *gitHubClientImpl) ListOrganizations(ctx context.Context, user string, opts *github.ListOptions) ([]*github.Organization, *github.Response, error) {
	return g.client.Organizations.List(ctx, user, opts)
}

// ListAllOrganizations implements GitHubClientInterface
func (g *gitHubClientImpl) ListAllOrganizations(ctx context.Context, opts *github.OrganizationsListOptions) ([]*github.Organization, *github.Response, error) {
	return g.client.Organizations.ListAll(ctx, opts)
}

// ListRepositories implements GitHubClientInterface
func (g *gitHubClientImpl) ListRepositories(ctx context.Context, org string, opts *github.RepositoryListByOrgOptions) ([]*github.Repository, *github.Response, error) {
	return g.client.Repositories.ListByOrg(ctx, org, opts)
}
