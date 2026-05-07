package internal

import (
	"fmt"
)

type SnykProject struct {
	ProjectID string
	Name      string
}

// ListSnykProjects lists all projects for a Snyk org (stub, replace with real API)
func ListSnykProjects(orgID string) ([]SnykProject, error) {
	// TODO: Replace with real Snyk API call
	if orgID == "" {
		return nil, fmt.Errorf("orgID required")
	}
	// Example stub data
	return []SnykProject{
		{ProjectID: "proj-1", Name: "Repo1"},
		{ProjectID: "proj-2", Name: "Repo2"},
	}, nil
}
