package internal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/sam1el/snyk-api-import-go/internal/network"
)

// AzureConfig holds Azure DevOps configuration
type AzureConfig struct {
	Token   string
	BaseURL string
}

// AzureProject represents an Azure DevOps project
type AzureProject struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AzureRepo represents an Azure DevOps repository
type AzureRepo struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	DefaultBranch string `json:"defaultBranch"`
	IsDisabled    bool   `json:"isDisabled"`
	Project       struct {
		Name string `json:"name"`
	} `json:"project"`
}

// AzureProjectsResponse represents the response from Azure Projects API
type AzureProjectsResponse struct {
	Value []AzureProject `json:"value"`
}

// AzureReposResponse represents the response from Azure Repos API
type AzureReposResponse struct {
	Value []AzureRepo `json:"value"`
}

// GetAzureAuth retrieves Azure DevOps configuration from environment variables
func GetAzureAuth() (AzureConfig, error) {
	token := os.Getenv("AZURE_TOKEN")
	if token == "" {
		return AzureConfig{}, fmt.Errorf("AZURE_TOKEN environment variable is not set")
	}

	baseURL := os.Getenv("AZURE_BASE_URL")
	if baseURL == "" {
		baseURL = "https://dev.azure.com"
	}

	// Remove trailing slash if present
	baseURL = strings.TrimSuffix(baseURL, "/")

	return AzureConfig{
		Token:   token,
		BaseURL: baseURL,
	}, nil
}

// ListAzureProjects fetches all projects for an Azure DevOps organization
func ListAzureProjects(ctx context.Context, auth AzureConfig, orgName string) ([]AzureProject, error) {
	if orgName == "" {
		return nil, fmt.Errorf("orgName is required")
	}

	Logger.Debugf("Fetching all projects for Azure org: %s", orgName)

	var allProjects []AzureProject
	continuationToken := ""
	pageNum := 1

	for {
		Logger.Debugf("Fetching page %d for Azure projects", pageNum)

		params := url.Values{}
		params.Add("stateFilter", "wellFormed")
		params.Add("api-version", "4.1")
		if continuationToken != "" {
			params.Add("continuationToken", continuationToken)
		}

		// Build the API URL based on the base URL format
		var apiURL string
		if strings.Contains(auth.BaseURL, "visualstudio.com") && !strings.Contains(auth.BaseURL, "dev.azure.com") {
			// *.visualstudio.com format: org is in subdomain, don't add to path
			apiURL = fmt.Sprintf("%s/_apis/projects?%s", auth.BaseURL, params.Encode())
		} else {
			// dev.azure.com format: org is in path
			apiURL = fmt.Sprintf("%s/%s/_apis/projects?%s", auth.BaseURL, url.PathEscape(orgName), params.Encode())
		}

		// Create request
		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		// Set Basic Auth header: base64(:{token})
		authString := base64.StdEncoding.EncodeToString([]byte(":" + auth.Token))
		req.Header.Set("Authorization", "Basic "+authString)

		// Execute request
		client := network.NewClient()
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("execute request: %w", err)
		}
		defer func() {
			_ = resp.Body.Close()
		}()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read response body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
		}

		var projectsResp AzureProjectsResponse
		if err := json.Unmarshal(body, &projectsResp); err != nil {
			return nil, fmt.Errorf("unmarshal response: %w", err)
		}

		for _, project := range projectsResp.Value {
			if project.Name != "" && project.ID != "" {
				allProjects = append(allProjects, project)
			}
		}

		// Check for continuation token in response headers
		continuationToken = resp.Header.Get("x-ms-continuationtoken")
		if continuationToken == "" || len(projectsResp.Value) == 0 {
			break
		}

		pageNum++
	}

	Logger.Infof("Org %s: Successfully fetched %d projects", orgName, len(allProjects))
	return allProjects, nil
}

// ListAzureRepos fetches all repositories for a specific Azure DevOps project
func ListAzureRepos(ctx context.Context, auth AzureConfig, orgName string, project AzureProject) ([]map[string]string, error) {
	if orgName == "" || project.ID == "" {
		return nil, fmt.Errorf("orgName and projectID are required")
	}

	Logger.Debugf("Fetching repos for project: %s", project.Name)

	// Build the API URL based on the base URL format
	var apiURL string
	if strings.Contains(auth.BaseURL, "visualstudio.com") && !strings.Contains(auth.BaseURL, "dev.azure.com") {
		// *.visualstudio.com format: org is in subdomain, don't add to path
		apiURL = fmt.Sprintf("%s/%s/_apis/git/repositories?api-version=4.1",
			auth.BaseURL,
			url.PathEscape(project.ID))
	} else {
		// dev.azure.com format: org is in path
		apiURL = fmt.Sprintf("%s/%s/%s/_apis/git/repositories?api-version=4.1",
			auth.BaseURL,
			url.PathEscape(orgName),
			url.PathEscape(project.ID))
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	// Set Basic Auth header: base64(:{token})
	authString := base64.StdEncoding.EncodeToString([]byte(":" + auth.Token))
	req.Header.Set("Authorization", "Basic "+authString)

	// Execute request
	client := network.NewClient()
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var reposResp AzureReposResponse
	if err := json.Unmarshal(body, &reposResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	var repos []map[string]string
	for _, repo := range reposResp.Value {
		// Filter out disabled repos and repos without default branches
		if repo.IsDisabled {
			Logger.Debugf("Skipping disabled repo: %s", repo.Name)
			continue
		}

		if repo.Name == "" || repo.Project.Name == "" || repo.DefaultBranch == "" {
			Logger.Debugf("Skipping repo with missing data: %s", repo.Name)
			continue
		}

		// Remove "refs/heads/" prefix from branch name if present and trim whitespace
		branch := strings.TrimSpace(strings.TrimPrefix(repo.DefaultBranch, "refs/heads/"))

		repos = append(repos, map[string]string{
			"id":      repo.ID,
			"name":    repo.Name,
			"owner":   repo.Project.Name, // Azure project name (Snyk uses this as "owner")
			"branch":  branch,
			"orgName": orgName, // Store org name for building full paths
		})
	}

	Logger.Debugf("Project %s: found %d active repos with default branches", project.Name, len(repos))
	return repos, nil
}

// ListAllAzureRepos fetches all repositories across all projects for an Azure DevOps organization
func ListAllAzureRepos(ctx context.Context, auth AzureConfig, orgName string) ([]map[string]string, error) {
	Logger.Infof("Fetching all repos for Azure org: %s", orgName)

	// First, get all projects
	projects, err := ListAzureProjects(ctx, auth, orgName)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}

	if len(projects) == 0 {
		Logger.Warnf("No projects found for Azure org: %s", orgName)
		return []map[string]string{}, nil
	}

	// Then, get repos for each project
	var allRepos []map[string]string
	for _, project := range projects {
		repos, err := ListAzureRepos(ctx, auth, orgName, project)
		if err != nil {
			Logger.Warnf("Failed to fetch repos for project %s: %v", project.Name, err)
			continue
		}
		allRepos = append(allRepos, repos...)
	}

	Logger.Infof("Azure org %s: successfully fetched %d repos across %d projects", orgName, len(allRepos), len(projects))
	return allRepos, nil
}

// AzureOrgIsEmpty checks if an Azure DevOps organization has any accessible projects efficiently
func AzureOrgIsEmpty(ctx context.Context, auth AzureConfig, orgName string) (bool, error) {
	Logger.Debugf("Checking if Azure org %s is empty", orgName)

	params := url.Values{}
	params.Add("stateFilter", "wellFormed")
	params.Add("api-version", "4.1")
	params.Add("$top", "1") // Only fetch 1 project to check if any exist

	// Build the API URL based on the base URL format
	var apiURL string
	if strings.Contains(auth.BaseURL, "visualstudio.com") && !strings.Contains(auth.BaseURL, "dev.azure.com") {
		// *.visualstudio.com format: org is in subdomain, don't add to path
		apiURL = fmt.Sprintf("%s/_apis/projects?%s", auth.BaseURL, params.Encode())
	} else {
		// dev.azure.com format: org is in path
		apiURL = fmt.Sprintf("%s/%s/_apis/projects?%s", auth.BaseURL, url.PathEscape(orgName), params.Encode())
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return false, fmt.Errorf("create request: %w", err)
	}

	authString := base64.StdEncoding.EncodeToString([]byte(":" + auth.Token))
	req.Header.Set("Authorization", "Basic "+authString)

	client := network.NewClient()
	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("execute request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var projectsResp AzureProjectsResponse
	if err := json.Unmarshal(body, &projectsResp); err != nil {
		return false, fmt.Errorf("unmarshal response: %w", err)
	}

	isEmpty := len(projectsResp.Value) == 0
	Logger.Debugf("Azure org %s isEmpty: %v", orgName, isEmpty)
	return isEmpty, nil
}

// AzureUserProfile represents the authenticated user's profile
type AzureUserProfile struct {
	PublicAlias string `json:"publicAlias"`
	ID          string `json:"id"`
}

// AzureAccount represents an Azure DevOps organization/account
type AzureAccount struct {
	AccountName string `json:"accountName"`
	AccountID   string `json:"accountId"`
}

// AzureAccountsResponse represents the response from the accounts API
type AzureAccountsResponse struct {
	Value []AzureAccount `json:"value"`
}

// ListAzureOrganizations automatically discovers all Azure DevOps organizations
// accessible to the authenticated user using their PAT token.
// This uses the Visual Studio Profile and Accounts APIs.
// Note: This only works for Azure DevOps Services (cloud), not for on-premise
// Azure DevOps Server instances.
func ListAzureOrganizations(ctx context.Context, auth AzureConfig) ([]string, error) {
	// Check if this is Azure DevOps Services (cloud) or on-premise
	// Cloud URLs: dev.azure.com or *.visualstudio.com
	// On-premise: custom domains (e.g., tfs.company.com)
	isCloud := strings.Contains(auth.BaseURL, "dev.azure.com") ||
		strings.Contains(auth.BaseURL, "visualstudio.com")

	if !isCloud {
		return nil, fmt.Errorf("auto-discovery is only supported for Azure DevOps Services. " +
			"For on-premise Azure DevOps Server, please use --azureOrgs flag to specify organization names")
	}

	Logger.Info("Auto-discovering Azure DevOps organizations for authenticated user")

	// Step 1: Get user profile to retrieve member ID
	profileURL := "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0"

	req, err := http.NewRequestWithContext(ctx, "GET", profileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create profile request: %w", err)
	}

	authString := base64.StdEncoding.EncodeToString([]byte(":" + auth.Token))
	req.Header.Set("Authorization", "Basic "+authString)

	client := network.NewClient()
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute profile request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read profile response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected profile status %d: %s", resp.StatusCode, string(body))
	}

	var profile AzureUserProfile
	if err := json.Unmarshal(body, &profile); err != nil {
		return nil, fmt.Errorf("unmarshal profile response: %w", err)
	}

	memberID := profile.PublicAlias
	if memberID == "" {
		memberID = profile.ID
	}
	if memberID == "" {
		return nil, fmt.Errorf("could not determine member ID from profile")
	}

	Logger.Debugf("Retrieved member ID: %s", memberID)

	// Step 2: Get organizations for the member
	accountsURL := fmt.Sprintf("https://app.vssps.visualstudio.com/_apis/accounts?memberId=%s&api-version=6.0",
		url.QueryEscape(memberID))

	req, err = http.NewRequestWithContext(ctx, "GET", accountsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create accounts request: %w", err)
	}

	req.Header.Set("Authorization", "Basic "+authString)

	resp, err = client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute accounts request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read accounts response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected accounts status %d: %s", resp.StatusCode, string(body))
	}

	var accountsResp AzureAccountsResponse
	if err := json.Unmarshal(body, &accountsResp); err != nil {
		return nil, fmt.Errorf("unmarshal accounts response: %w", err)
	}

	var orgNames []string
	for _, account := range accountsResp.Value {
		if account.AccountName != "" {
			orgNames = append(orgNames, account.AccountName)
		}
	}

	Logger.Infof("Auto-discovered %d Azure DevOps organization(s)", len(orgNames))
	for _, orgName := range orgNames {
		Logger.Debugf("  - %s", orgName)
	}

	return orgNames, nil
}
