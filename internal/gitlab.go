package internal

import (
	"context"
	"fmt"
	"os"
	"strings"

	gitlab "gitlab.com/gitlab-org/api/client-go"
)

// GitLabAuth represents authentication configuration for GitLab
type GitLabAuth struct {
	Token   string
	BaseURL string // Optional: defaults to https://gitlab.com
}

// GetGitLabAuth retrieves GitLab credentials from environment variables.
// Environment variables:
// - GITLAB_TOKEN: Personal access token or OAuth token (required)
// - GITLAB_BASE_URL: Base URL for GitLab instance (optional, defaults to https://gitlab.com)
func GetGitLabAuth() (*GitLabAuth, error) {
	token := strings.TrimSpace(os.Getenv("GITLAB_TOKEN"))
	if token == "" {
		return nil, fmt.Errorf("GITLAB_TOKEN environment variable is required. Please set it with your GitLab personal access token")
	}

	baseURL := strings.TrimSpace(os.Getenv("GITLAB_BASE_URL"))
	if baseURL == "" {
		baseURL = "https://gitlab.com"
	}

	return &GitLabAuth{
		Token:   token,
		BaseURL: baseURL,
	}, nil
}

// NewGitLabClient creates a new GitLab API client with the provided auth
func NewGitLabClient(auth *GitLabAuth) (*gitlab.Client, error) {
	if auth == nil {
		var err error
		auth, err = GetGitLabAuth()
		if err != nil {
			return nil, fmt.Errorf("get auth: %w", err)
		}
	}

	client, err := gitlab.NewClient(auth.Token, gitlab.WithBaseURL(auth.BaseURL))
	if err != nil {
		return nil, fmt.Errorf("failed to create GitLab client: %w", err)
	}

	return client, nil
}

// GitLabGroup represents a GitLab group
type GitLabGroup struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	FullPath string `json:"full_path"`
	WebURL   string `json:"web_url"`
}

// GitLabRepo represents a GitLab project/repository
type GitLabRepo struct {
	ID                int    `json:"id"`
	Name              string `json:"name"`
	PathWithNamespace string `json:"path_with_namespace"`
	DefaultBranch     string `json:"default_branch"`
	Fork              bool   `json:"fork"`
	Archived          bool   `json:"archived"`
}

// ListGitLabGroups fetches all GitLab groups accessible to the authenticated user.
// It handles pagination automatically and returns all groups.
func ListGitLabGroups(ctx context.Context, auth *GitLabAuth) ([]GitLabGroup, error) {
	client, err := NewGitLabClientWrapper(auth)
	if err != nil {
		return nil, err
	}
	return ListGitLabGroupsWithClient(ctx, client)
}

// ListGitLabGroupsWithClient fetches all GitLab groups using the provided client.
// This function is designed for testability via dependency injection.
func ListGitLabGroupsWithClient(ctx context.Context, client GitLabClientInterface) ([]GitLabGroup, error) {
	Logger.Info("Fetching all GitLab groups")

	var allGroups []GitLabGroup
	page := 1
	perPage := 100

	for {
		opts := &gitlab.ListGroupsOptions{
			ListOptions: gitlab.ListOptions{
				Page:    page,
				PerPage: perPage,
			},
		}

		groups, resp, err := client.ListGroups(opts, gitlab.WithContext(ctx))
		if err != nil {
			return nil, fmt.Errorf("failed to list GitLab groups (page %d): %w", page, err)
		}

		Logger.Debugf("Fetched page %d with %d groups", page, len(groups))

		for _, group := range groups {
			allGroups = append(allGroups, GitLabGroup{
				ID:       group.ID,
				Name:     group.Name,
				FullPath: group.FullPath,
				WebURL:   group.WebURL,
			})
		}

		// Check if there are more pages
		if resp.NextPage == 0 {
			break
		}

		page = resp.NextPage
	}

	Logger.Infof("Successfully fetched %d GitLab groups", len(allGroups))
	return allGroups, nil
}

// ListGitLabRepos fetches all projects/repositories for a given GitLab group.
// It handles pagination automatically and filters out archived projects and those without a default branch.
// The groupPath parameter should be the full path of the group (e.g., "myorg" or "myorg/subgroup").
func ListGitLabRepos(ctx context.Context, auth *GitLabAuth, groupPath string) ([]GitLabRepo, error) {
	if groupPath == "" {
		return nil, fmt.Errorf("groupPath is required")
	}

	client, err := NewGitLabClientWrapper(auth)
	if err != nil {
		return nil, err
	}
	return ListGitLabReposWithClient(ctx, client, groupPath)
}

// ListGitLabReposWithClient fetches all projects/repositories using the provided client.
// This function is designed for testability via dependency injection.
func ListGitLabReposWithClient(ctx context.Context, client GitLabClientInterface, groupPath string) ([]GitLabRepo, error) {
	if groupPath == "" {
		return nil, fmt.Errorf("groupPath is required")
	}

	Logger.Infof("Fetching all repos for GitLab group: %s", groupPath)

	var allRepos []GitLabRepo
	page := 1
	perPage := 100

	for {
		opts := &gitlab.ListGroupProjectsOptions{
			ListOptions: gitlab.ListOptions{
				Page:    page,
				PerPage: perPage,
			},
			WithShared: gitlab.Ptr(false), // Exclude shared projects
		}

		projects, resp, err := client.ListGroupProjects(groupPath, opts, gitlab.WithContext(ctx))
		if err != nil {
			return nil, fmt.Errorf("failed to list projects for group '%s' (page %d): %w", groupPath, page, err)
		}

		Logger.Debugf("Group %s: Fetched page %d with %d projects", groupPath, page, len(projects))

		for _, project := range projects {
			// Skip archived projects
			if project.Archived {
				Logger.Debugf("Skipping archived project: %s", project.PathWithNamespace)
				continue
			}

			// Skip projects without a default branch
			if project.DefaultBranch == "" {
				Logger.Debugf("Skipping project without default branch: %s", project.PathWithNamespace)
				continue
			}

			// Skip projects not directly in this group (only if namespace doesn't match)
			// This ensures we only get projects directly owned by this group
			if project.Namespace != nil && project.Namespace.FullPath != groupPath {
				Logger.Debugf("Skipping project %s as it belongs to another group: %s", project.PathWithNamespace, project.Namespace.FullPath)
				continue
			}

			allRepos = append(allRepos, GitLabRepo{
				ID:                project.ID,
				Name:              project.Name,
				PathWithNamespace: project.PathWithNamespace,
				DefaultBranch:     project.DefaultBranch,
				Fork:              project.ForkedFromProject != nil,
				Archived:          project.Archived,
			})
		}

		// Check if there are more pages
		if resp.NextPage == 0 {
			break
		}

		page = resp.NextPage
	}

	Logger.Infof("Group %s: Successfully fetched %d repos", groupPath, len(allRepos))
	return allRepos, nil
}

// GitLabGroupIsEmpty checks if a GitLab group has any projects (repositories).
// It fetches just the first page with one project to efficiently check for emptiness.
func GitLabGroupIsEmpty(ctx context.Context, auth *GitLabAuth, groupPath string) (bool, error) {
	if groupPath == "" {
		return false, fmt.Errorf("groupPath is required")
	}

	client, err := NewGitLabClientWrapper(auth)
	if err != nil {
		return false, err
	}
	return GitLabGroupIsEmptyWithClient(ctx, client, groupPath)
}

// GitLabGroupIsEmptyWithClient checks if a group is empty using the provided client.
// This function is designed for testability via dependency injection.
func GitLabGroupIsEmptyWithClient(ctx context.Context, client GitLabClientInterface, groupPath string) (bool, error) {
	if groupPath == "" {
		return false, fmt.Errorf("groupPath is required")
	}

	Logger.Debugf("Checking if GitLab group is empty: %s", groupPath)

	opts := &gitlab.ListGroupProjectsOptions{
		ListOptions: gitlab.ListOptions{
			Page:    1,
			PerPage: 1, // Only need to fetch 1 project to determine if group is empty
		},
		WithShared: gitlab.Ptr(false), // Exclude shared projects
	}

	projects, _, err := client.ListGroupProjects(groupPath, opts, gitlab.WithContext(ctx))
	if err != nil {
		return false, fmt.Errorf("failed to check if group '%s' is empty: %w", groupPath, err)
	}

	// Filter out archived projects and those without default branches
	validProjects := 0
	for _, project := range projects {
		if !project.Archived && project.DefaultBranch != "" {
			validProjects++
		}
	}

	isEmpty := validProjects == 0
	Logger.Debugf("Group %s is empty: %v", groupPath, isEmpty)

	return isEmpty, nil
}
