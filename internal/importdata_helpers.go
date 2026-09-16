package internal

import (
	"fmt"
)

// buildGitHubImportTarget creates an ImportTarget from a GitHub repository map
func buildGitHubImportTarget(repo map[string]interface{}, orgID, integrationID string) (ImportTarget, error) {
	name, _ := repo["name"].(string)
	owner, _ := repo["owner"].(string)
	branch, _ := repo["default_branch"].(string)

	if name == "" {
		return ImportTarget{}, fmt.Errorf("repo missing name field")
	}

	if branch == "" {
		branch = "main" // Default branch
	}

	return ImportTarget{
		Target: Target{
			Name:   name,
			Owner:  owner,
			Branch: branch,
			Fork:   false,
		},
		OrgID:         orgID,
		IntegrationID: integrationID,
	}, nil
}

// buildGitLabImportTarget creates an ImportTarget from a GitLab project map
func buildGitLabImportTarget(project map[string]interface{}, orgID, integrationID string) (ImportTarget, error) {
	// GitLab uses numeric IDs
	id, ok := project["id"].(float64)
	if !ok {
		// Try int
		if idInt, ok := project["id"].(int); ok {
			id = float64(idInt)
		} else {
			return ImportTarget{}, fmt.Errorf("project missing id field")
		}
	}

	branch, _ := project["default_branch"].(string)
	if branch == "" {
		branch = "main"
	}

	return ImportTarget{
		Target: Target{
			ID:     int(id),
			Branch: branch,
			Fork:   false,
		},
		OrgID:         orgID,
		IntegrationID: integrationID,
	}, nil
}

// buildAzureImportTarget creates an ImportTarget from an Azure repo map
func buildAzureImportTarget(repo map[string]interface{}, orgID, integrationID string) (ImportTarget, error) {
	name, _ := repo["name"].(string)
	owner, _ := repo["owner"].(string) // Azure project name
	defaultBranch, _ := repo["defaultBranch"].(string)

	if name == "" {
		return ImportTarget{}, fmt.Errorf("repo missing name field")
	}

	// Parse branch ref (Azure uses refs/heads/branch-name)
	branch := "main"
	if defaultBranch != "" {
		// Strip refs/heads/ prefix if present
		if len(defaultBranch) > 11 && defaultBranch[:11] == "refs/heads/" {
			branch = defaultBranch[11:]
		} else {
			branch = defaultBranch
		}
	}

	return ImportTarget{
		Target: Target{
			Name:   name,
			Owner:  owner,
			Branch: branch,
			Fork:   false,
		},
		OrgID:         orgID,
		IntegrationID: integrationID,
	}, nil
}

// buildBitbucketImportTarget creates an ImportTarget from a Bitbucket Cloud repo map
func buildBitbucketImportTarget(repo map[string]interface{}, orgID, integrationID string) (ImportTarget, error) {
	name, _ := repo["name"].(string)
	branch, _ := repo["mainbranch"].(string)

	if name == "" {
		return ImportTarget{}, fmt.Errorf("repo missing name field")
	}

	if branch == "" {
		branch = "main"
	}

	return ImportTarget{
		Target: Target{
			Name:   name,
			Branch: branch,
			Fork:   false,
		},
		OrgID:         orgID,
		IntegrationID: integrationID,
	}, nil
}

// buildBitbucketServerImportTarget creates an ImportTarget from a Bitbucket Server repo map
func buildBitbucketServerImportTarget(repo map[string]interface{}, orgID, integrationID string) (ImportTarget, error) {
	repoSlug, _ := repo["repoSlug"].(string)
	projectKey, _ := repo["projectKey"].(string)
	branch, _ := repo["branch"].(string)

	if repoSlug == "" {
		return ImportTarget{}, fmt.Errorf("repo missing repoSlug field")
	}

	if projectKey == "" {
		return ImportTarget{}, fmt.Errorf("repo missing projectKey field")
	}

	if branch == "" {
		branch = "main" // Default branch
	}

	return ImportTarget{
		Target: Target{
			ProjectKey: projectKey,
			RepoSlug:   repoSlug,
			Branch:     branch,
			Fork:       false,
		},
		OrgID:         orgID,
		IntegrationID: integrationID,
	}, nil
}

// BuildImportTargetsFromRepos creates import targets from repository data
// This is a testable helper that doesn't make any HTTP calls
func BuildImportTargetsFromRepos(repos []map[string]interface{}, source, orgID, integrationID string) ([]ImportTarget, error) {
	targets := make([]ImportTarget, 0, len(repos))

	for _, repo := range repos {
		var target ImportTarget
		var err error

		switch source {
		case "github":
			target, err = buildGitHubImportTarget(repo, orgID, integrationID)
		case "gitlab":
			target, err = buildGitLabImportTarget(repo, orgID, integrationID)
		case "azure-repos":
			target, err = buildAzureImportTarget(repo, orgID, integrationID)
		case "bitbucket-cloud":
			target, err = buildBitbucketImportTarget(repo, orgID, integrationID)
		case "bitbucket-server":
			target, err = buildBitbucketServerImportTarget(repo, orgID, integrationID)
		default:
			return nil, fmt.Errorf("unsupported source: %s", source)
		}

		if err != nil {
			Logger.Warnf("Skipping repo due to error: %v", err)
			continue
		}

		targets = append(targets, target)
	}

	return targets, nil
}
