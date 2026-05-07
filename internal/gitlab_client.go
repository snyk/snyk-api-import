package internal

import (
	"errors"

	gitlab "gitlab.com/gitlab-org/api/client-go"
)

var (
	// ErrMissingToken is returned when GitLab token is not provided
	ErrMissingToken = errors.New("GitLab token is required")
)

// GitLabClientInterface defines the methods we need from the GitLab client.
// This interface allows us to mock the GitLab API for testing.
type GitLabClientInterface interface {
	// ListGroups lists all groups accessible to the authenticated user
	ListGroups(opts *gitlab.ListGroupsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Group, *gitlab.Response, error)

	// ListGroupProjects lists all projects in a group
	ListGroupProjects(gid interface{}, opts *gitlab.ListGroupProjectsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Project, *gitlab.Response, error)
}

// gitLabClientImpl wraps the real GitLab client to implement our interface
type gitLabClientImpl struct {
	client *gitlab.Client
}

// NewGitLabClientWrapper creates a new GitLab client wrapper
func NewGitLabClientWrapper(auth *GitLabAuth) (GitLabClientInterface, error) {
	if auth == nil {
		var err error
		auth, err = GetGitLabAuth()
		if err != nil {
			return nil, err
		}
	}

	if auth.Token == "" {
		return nil, ErrMissingToken
	}

	client, err := gitlab.NewClient(auth.Token, gitlab.WithBaseURL(auth.BaseURL))
	if err != nil {
		return nil, err
	}

	return &gitLabClientImpl{client: client}, nil
}

// ListGroups implements GitLabClientInterface
func (g *gitLabClientImpl) ListGroups(opts *gitlab.ListGroupsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Group, *gitlab.Response, error) {
	return g.client.Groups.ListGroups(opts, options...)
}

// ListGroupProjects implements GitLabClientInterface
func (g *gitLabClientImpl) ListGroupProjects(gid interface{}, opts *gitlab.ListGroupProjectsOptions, options ...gitlab.RequestOptionFunc) ([]*gitlab.Project, *gitlab.Response, error) {
	return g.client.Groups.ListGroupProjects(gid, opts, options...)
}
