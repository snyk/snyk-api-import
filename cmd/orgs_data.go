package cmd

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/snyk/snyk-api-import/internal"
	"github.com/snyk/snyk-api-import/internal/logging"
	"github.com/snyk/snyk-api-import/internal/utils"
)

// OrgsDataCmd generates Snyk org data from source control systems (Bitbucket, GitHub, GitLab)
func OrgsDataCmd(ctx context.Context, cfg internal.AppConfig) {
	fs := flag.NewFlagSet("orgs:data", flag.ExitOnError)
	groupID := fs.String("groupId", "", "Snyk group ID")
	source := fs.String("source", "github", "Source type")
	sourceURL := fs.String("sourceUrl", "", "Custom source control URL (for GitHub Enterprise, self-hosted GitLab, Bitbucket Server, Azure DevOps Server)")
	sourceOrgPublicID := fs.String("sourceOrgPublicId", "", "Public id of a Snyk org to copy settings from (optional)")
	skipEmptyOrgs := fs.Bool("skipEmptyOrgs", false, "Skip organizations that have no targets (e.g. no repos)")
	azureOrgs := fs.String("azureOrgs", "", "Comma-separated list of Azure DevOps organization names (for azure-repos source)")
	if err := fs.Parse(os.Args[2:]); err != nil {
		logging.Errorf("Error parsing flags: %v", err)
		return
	}

	// Apply integration config from TOML based on --source flag
	// This will set environment variables for the specified integration
	if err := internal.ApplySourceConfigToEnv(*source); err != nil {
		// Not a fatal error - user might be using environment variables instead
		logging.Debugf("Could not apply integration config for %s: %v", *source, err)
	}

	// If groupID not provided via CLI, try to get it from config.toml or env var
	if *groupID == "" {
		// First check SNYK_GROUP_ID env var (which may have been set by ApplySourceConfigToEnv)
		*groupID = os.Getenv("SNYK_GROUP_ID")
		if *groupID != "" {
			logging.Debugf("Using SNYK_GROUP_ID from config.toml: %s", *groupID)
		}
	}

	// Final validation
	if *groupID == "" {
		logging.ValidationErrorf("--groupId is required (provide via CLI flag or config.toml)")
		return
	}

	// If azureOrgs flag is empty and source is azure-repos, try to get default_org from config
	if *azureOrgs == "" && *source == "azure-repos" {
		if tomlCfg := internal.GetGlobalTOMLConfig(); tomlCfg != nil {
			if integration, err := tomlCfg.GetIntegrationConfig(*source); err == nil && integration.DefaultOrg != "" {
				*azureOrgs = integration.DefaultOrg
				logging.Debugf("Using default Azure org from config: %s", *azureOrgs)
			}
		}
	}

	// Handle custom source URL if provided (overrides config file)
	if *sourceURL != "" {
		switch *source {
		case "github", "github-com":
			if err := os.Setenv("GITHUB_API_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set GITHUB_API_URL: %v", err)
				return
			}
		case "gitlab":
			if err := os.Setenv("GITLAB_BASE_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set GITLAB_BASE_URL: %v", err)
				return
			}
		case "azure-repos":
			if err := os.Setenv("AZURE_BASE_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set AZURE_BASE_URL: %v", err)
				return
			}
		case "bitbucket-server":
			if err := os.Setenv("BITBUCKET_SERVER_URL", *sourceURL); err != nil {
				logging.Errorf("Failed to set BITBUCKET_SERVER_URL: %v", err)
				return
			}
		default:
			logging.Warnf("--sourceURL is not applicable for source type %s", *source)
		}
	}

	// Always auto-generate output file name
	var outputFile string
	switch *source {
	case "bitbucket-cloud-app":
		outputFile = fmt.Sprintf("group-%s-bitbucket-cloud-app-orgs.json", *groupID)
	case "bitbucket-cloud":
		outputFile = fmt.Sprintf("group-%s-bitbucket-cloud-orgs.json", *groupID)
	case "github", "github-com":
		outputFile = fmt.Sprintf("group-%s-github-orgs.json", *groupID)
	case "github-cloud-app":
		outputFile = fmt.Sprintf("group-%s-github-cloud-app-orgs.json", *groupID)
	case "gitlab":
		outputFile = fmt.Sprintf("group-%s-gitlab-orgs.json", *groupID)
	case "azure-repos":
		outputFile = fmt.Sprintf("group-%s-azure-repos-orgs.json", *groupID)
	case "bitbucket-server":
		outputFile = fmt.Sprintf("group-%s-bitbucket-server-orgs.json", *groupID)
	default:
		outputFile = "snyk-orgs.json"
	}
	snykLogPath := cfg.SnykLogPath
	if snykLogPath == "" {
		snykLogPath = os.Getenv("SNYK_LOG_PATH")
	}
	type Org struct {
		Name        string `json:"name"`
		GroupID     string `json:"groupId"`               // Note: Snyk API uses camelCase with lowercase 'i'
		SourceOrgID string `json:"sourceOrgId,omitempty"` // Note: Snyk API uses camelCase with lowercase 'i'
	}
	var orgsOut []Org
	if *source == "bitbucket-cloud-app" {
		token := os.Getenv("BITBUCKET_APP_TOKEN")
		if token == "" {
			clientID := cfg.BitbucketAppClientID
			if clientID == "" {
				clientID = os.Getenv("BITBUCKET_APP_CLIENT_ID")
			}
			clientSecret := cfg.BitbucketAppClientSecret
			if clientSecret == "" {
				clientSecret = os.Getenv("BITBUCKET_APP_CLIENT_SECRET")
			}
			var err error
			token, err = internal.FetchBitbucketAppToken(ctx, clientID, clientSecret)
			if err != nil {
				logging.Errorf("Failed to get Bitbucket app token: %v", err)
				return
			}
		}
		workspaces, err := internal.FetchBitbucketAppWorkspaces(ctx, token)
		if err != nil {
			logging.Errorf("Failed to fetch Bitbucket workspaces: %v", err)
			return
		}
		for _, ws := range workspaces {
			if *skipEmptyOrgs {
				// check if workspace has repos; skip if none or on error
				repos, err := internal.FetchBitbucketAppRepos(ctx, token, ws)
				if err != nil {
					logging.Warnf("Failed to fetch repos for workspace %s: %v; skipping", ws, err)
					continue
				}
				if len(repos) == 0 {
					logging.Debugf("Skipping workspace %s because it has no repos", ws)
					continue
				}
			}
			o := Org{
				Name:    ws,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}
	} else if *source == "bitbucket-cloud" {
		// Get Bitbucket Cloud auth (Basic Auth with username and API token)
		auth, err := internal.GetBitbucketCloudAuth()
		if err != nil {
			logging.Errorf("Failed to get Bitbucket Cloud credentials: %v", err)
			logging.Errorf("Set BITBUCKET_CLOUD_USERNAME + BITBUCKET_CLOUD_PASSWORD, or BITBUCKET_CLOUD_API_TOKEN, or BITBUCKET_CLOUD_OAUTH_TOKEN")
			return
		}
		logging.Infof("Using Bitbucket Cloud auth method: %s", auth.Method)

		// Fetch workspaces using the new function
		workspaces, err := internal.FetchBitbucketCloudWorkspaces(ctx, auth)
		if err != nil {
			logging.Errorf("Failed to fetch Bitbucket Cloud workspaces: %v", err)
			return
		}

		for _, ws := range workspaces {
			if *skipEmptyOrgs {
				// Check if workspace has repos; skip if none or on error
				repos, err := internal.FetchRepos(ctx, auth, ws)
				if err != nil {
					logging.Warnf("Failed to fetch repos for workspace %s: %v; skipping", ws, err)
					continue
				}
				if len(repos) == 0 {
					logging.Debugf("Skipping workspace %s because it has no repos", ws)
					continue
				}
			}
			o := Org{
				Name:    ws,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}
	} else if *source == "github" || *source == "github-com" {
		// GitHub with Personal Access Token
		auth, err := internal.GetGitHubAuth()
		if err != nil {
			logging.Errorf("Failed to get GitHub credentials: %v", err)
			logging.Errorf("Set GITHUB_TOKEN environment variable")
			return
		}

		orgs, err := internal.FetchGitHubOrgs(ctx, auth)
		if err != nil {
			logging.Errorf("Failed to fetch GitHub organizations: %v", err)
			return
		}

		for _, org := range orgs {
			if *skipEmptyOrgs {
				// Check if org has repos; skip if none or on error
				repos, err := internal.FetchGitHubRepos(ctx, auth, org.Name, nil)
				if err != nil {
					logging.Warnf("Failed to fetch repos for org %s: %v; skipping", org.Name, err)
					continue
				}
				if len(repos) == 0 {
					logging.Debugf("Skipping org %s because it has no repos", org.Name)
					continue
				}
			}
			o := Org{
				Name:    org.Name,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}
	} else if *source == "github-cloud-app" {
		// GitHub with GitHub App authentication
		installations, err := internal.FetchGitHubAppOrgs(ctx)
		if err != nil {
			logging.Errorf("Failed to fetch GitHub App organizations: %v", err)
			logging.Errorf("Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY environment variables")
			return
		}

		// Get a token for checking repos
		config, err := internal.GetGitHubAppConfig()
		if err != nil {
			logging.Errorf("Failed to get GitHub App config: %v", err)
			return
		}

		token, err := internal.FetchGitHubAppToken(ctx, config)
		if err != nil {
			logging.Errorf("Failed to get GitHub App token: %v", err)
			return
		}

		for _, inst := range installations {
			if inst.Account == nil || inst.Account.Login == nil {
				continue
			}
			orgName := *inst.Account.Login

			if *skipEmptyOrgs {
				// Check if org has repos; skip if none or on error
				repos, err := internal.FetchGitHubAppRepos(ctx, token, orgName, nil)
				if err != nil {
					logging.Warnf("Failed to fetch repos for org %s: %v; skipping", orgName, err)
					continue
				}
				if len(repos) == 0 {
					logging.Debugf("Skipping org %s because it has no repos", orgName)
					continue
				}
			}

			o := Org{
				Name:    orgName,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}
	} else if *source == "gitlab" {
		// Get GitLab auth
		auth, err := internal.GetGitLabAuth()
		if err != nil {
			logging.Errorf("Failed to get GitLab credentials: %v", err)
			logging.Errorf("Set GITLAB_TOKEN environment variable with your GitLab personal access token")
			return
		}
		logging.Infof("Using GitLab instance: %s", auth.BaseURL)

		// Fetch GitLab groups
		groups, err := internal.ListGitLabGroups(ctx, auth)
		if err != nil {
			logging.Errorf("Failed to fetch GitLab groups: %v", err)
			return
		}

		for _, group := range groups {
			if *skipEmptyOrgs {
				// Check if group has repos; skip if none or on error
				isEmpty, err := internal.GitLabGroupIsEmpty(ctx, auth, group.FullPath)
				if err != nil {
					logging.Warnf("Failed to check if group %s is empty: %v; skipping", group.FullPath, err)
					continue
				}
				if isEmpty {
					logging.Debugf("Skipping group %s because it has no projects", group.FullPath)
					continue
				}
			}
			o := Org{
				Name:    group.FullPath,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}
	} else if *source == "azure-repos" {
		// Get Azure DevOps auth
		auth, err := internal.GetAzureAuth()
		if err != nil {
			logging.Errorf("Failed to get Azure credentials: %v", err)
			logging.Errorf("Set AZURE_TOKEN environment variable with your Azure DevOps personal access token")
			return
		}
		logging.Infof("Using Azure DevOps instance: %s", auth.BaseURL)

		var orgNames []string

		// Auto-discover organizations if not explicitly provided
		if *azureOrgs == "" {
			// Check if we can auto-discover (only works for Azure DevOps Services)
			// Cloud URLs: dev.azure.com or *.visualstudio.com
			isCloud := strings.Contains(auth.BaseURL, "dev.azure.com") ||
				strings.Contains(auth.BaseURL, "visualstudio.com")

			if !isCloud {
				logging.Warnf("Auto-discovery is only supported for Azure DevOps Services")
				logging.Warnf("For on-premise Azure DevOps Server, please specify organizations manually")
				logging.Warnf("Example: --azureOrgs=\"your-org-name\"")
				logging.Warnf("Your instance: %s", auth.BaseURL)
				return
			}

			logging.Infof("No Azure organizations specified, attempting auto-discovery...")
			discoveredOrgs, err := internal.ListAzureOrganizations(ctx, auth)
			if err != nil {
				logging.Errorf("Failed to auto-discover Azure organizations: %v", err)
				logging.Errorf("You can manually specify organizations via --azureOrgs=\"org1,org2,org3\"")
				return
			}
			if len(discoveredOrgs) == 0 {
				logging.Warnf("No Azure organizations found for authenticated user")
				return
			}
			orgNames = discoveredOrgs
		} else {
			// Split and validate Azure org names from flag
			orgNamesParts := strings.Split(*azureOrgs, ",")
			for _, part := range orgNamesParts {
				trimmed := strings.TrimSpace(part)
				if trimmed != "" {
					orgNames = append(orgNames, trimmed)
				}
			}

			if len(orgNames) == 0 {
				logging.Errorf("No valid Azure organization names provided")
				return
			}
		}

		logging.Infof("Processing %d Azure DevOps organization(s)", len(orgNames))

		for _, orgName := range orgNames {
			// Validate that the org exists by checking if it has any projects
			if *skipEmptyOrgs {
				isEmpty, err := internal.AzureOrgIsEmpty(ctx, auth, orgName)
				if err != nil {
					logging.Warnf("Failed to check if Azure org '%s' is empty: %v; skipping", orgName, err)
					continue
				}
				if isEmpty {
					logging.Debugf("Skipping Azure org '%s' because it has no projects", orgName)
					continue
				}
			} else {
				// Just validate the org exists
				projects, err := internal.ListAzureProjects(ctx, auth, orgName)
				if err != nil {
					logging.Warnf("Failed to validate Azure org '%s': %v; skipping", orgName, err)
					continue
				}
				logging.Infof("Azure org '%s': found %d projects", orgName, len(projects))
			}

			o := Org{
				Name:    orgName,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}

		if len(orgsOut) == 0 {
			logging.Warnf("No valid Azure DevOps organizations to add")
			logging.Warnf("Note: You'll need to manually add the 'integrations' field with your azure-repos integration ID")
			return
		}
	} else if *source == "bitbucket-server" {
		// Bitbucket Server: fetch projects from Bitbucket Server
		logging.Infof("Fetching Bitbucket Server projects...")

		auth := internal.GetBitbucketServerAuth()
		projects, err := internal.FetchBitbucketServerProjects(ctx, auth)
		if err != nil {
			logging.Errorf("Failed to fetch Bitbucket Server projects: %v", err)
			return
		}

		logging.Infof("Found %d Bitbucket Server projects", len(projects))

		for _, project := range projects {
			if *skipEmptyOrgs {
				// Use project.Key to match what we store in org name
				isEmpty, err := internal.BitbucketServerProjectIsEmpty(ctx, auth, project.Key)
				if err != nil {
					logging.Warnf("Failed to check if project '%s' is empty: %v; skipping", project.Key, err)
					continue
				}
				if isEmpty {
					logging.Debugf("Skipping project '%s' because it has no repos", project.Key)
					continue
				}
			}

			// Use project KEY for Snyk org name to match TypeScript version's use of project.key
			// This keeps the org name short and matches URL conventions
			o := Org{
				Name:    project.Key,
				GroupID: *groupID,
			}
			if *sourceOrgPublicID != "" {
				o.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, o)
		}

		if len(orgsOut) == 0 {
			logging.Warnf("No valid Bitbucket Server projects to add")
			logging.Warnf("Note: You'll need to manually add the 'integrations' field with your bitbucket-server integration ID")
			return
		}
	} else {
		// Basic validation for groupID to reduce SSRF risk in downstream calls
		gid := *groupID
		if gid == "" {
			logging.ValidationErrorf("groupID is required")
			return
		}
		orgs, err := internal.FetchSnykOrgs(ctx, gid)
		if err != nil {
			logging.Errorf("Failed to generate orgs: %v", err)
			return
		}
		for _, o := range orgs {
			if *skipEmptyOrgs {
				// Query Snyk for targets for this org; skip if none or on error
				targets, err := internal.ListTargets(ctx, o.ID, "")
				if err != nil {
					logging.Warnf("Failed to fetch targets for org %s: %v; skipping", o.Name, err)
					continue
				}
				if len(targets) == 0 {
					logging.Debugf("Skipping org %s because it has no targets", o.Name)
					continue
				}
			}
			out := Org{
				Name:    o.Name,
				GroupID: o.GroupID,
			}
			if *sourceOrgPublicID != "" {
				out.SourceOrgID = *sourceOrgPublicID
			}
			orgsOut = append(orgsOut, out)
		}
	}
	output := map[string]interface{}{"orgs": orgsOut}
	outFilePath := filepath.Join(snykLogPath, outputFile)
	resolvedOut, err := internal.ResolveSafePath(outFilePath)
	if err != nil {
		logging.Errorf("Refusing to write orgs file to unsafe path: %v", err)
		return
	}
	b, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		logging.Errorf("Failed to marshal orgs output: %v", err)
		return
	}
	odi := utils.NewOutputDestination()
	if err := odi.WriteFile(resolvedOut, b, 0600); err != nil {
		logging.Errorf("Failed to write orgs file: %v", err)
		return
	}
	logging.Infof("Snyk org data written to %s", outFilePath)
}
