// ImportTargets imports all targets in the given file using Snyk API
package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/snyk/snyk-api-import/internal/security"
	"github.com/snyk/snyk-api-import/internal/utils"
)

// ImportTargetsParallel imports repositories from a targets file into Snyk using parallel workers.
// This is the new parallel implementation that should be preferred over ImportTargets.
func ImportTargetsParallel(ctx context.Context, targetsFile string, source string) error {
	snykToken := os.Getenv("SNYK_API_TOKEN")
	if snykToken == "" {
		// accept legacy SNYK_TOKEN as well
		snykToken = os.Getenv("SNYK_TOKEN")
		if snykToken == "" {
			return fmt.Errorf("SNYK_API_TOKEN or SNYK_TOKEN must be set in environment")
		}
		Logger.Debugf("Using SNYK_TOKEN as Snyk API token")
	}

	targets, err := LoadImportTargetsFromFile(targetsFile)
	if err != nil {
		return err
	}

	if len(targets) == 0 {
		Logger.Infof("No targets found in file")
		return nil
	}

	// Debug: Log first target to verify parsing
	if len(targets) > 0 {
		Logger.Debugf("First target parsed: orgID=%s, integrationID=%s, name=%s",
			targets[0].OrgID, targets[0].IntegrationID, targets[0].Target.Name)
	}

	// Group targets by orgID and integrationID to run parallel imports per org
	type orgKey struct {
		orgID         string
		integrationID string
	}
	targetsByOrg := make(map[orgKey][]ImportTarget)
	for _, t := range targets {
		key := orgKey{orgID: t.OrgID, integrationID: t.IntegrationID}
		targetsByOrg[key] = append(targetsByOrg[key], t)
	}

	// Run parallel imports for each org
	totalImported := 0
	totalFailed := 0
	totalSkipped := 0

	for key, orgTargets := range targetsByOrg {
		Logger.Infof("Importing %d targets for org %s", len(orgTargets), key.orgID)

		config := ParallelImportConfig{
			OrgID:         key.orgID,
			IntegrationID: key.integrationID,
			Source:        source,
			Concurrency:   GetImportConcurrency(0),
			SnykToken:     snykToken,
			PollTimeout:   GetPollTimeout(),
			DryRun:        false,
		}

		results, err := ParallelImport(ctx, orgTargets, config)
		if err != nil {
			Logger.Errorf("Parallel import failed for org %s: %v", key.orgID, err)
			continue
		}

		imported, failed, skipped := results.GetCounts()
		totalImported += imported
		totalFailed += failed
		totalSkipped += skipped

		Logger.Infof("Org %s: %d imported, %d failed, %d skipped", key.orgID, imported, failed, skipped)
	}

	Logger.Infof("Total: %d imported, %d failed, %d skipped", totalImported, totalFailed, totalSkipped)
	return nil
}

// ImportBitbucketCloudTargets imports Bitbucket Cloud targets using the Snyk Import API.
// This is a wrapper around the generic import function for backward compatibility.
func ImportBitbucketCloudTargets(ctx context.Context, targetsFile string) error {
	return ImportTargetsParallel(ctx, targetsFile, "bitbucket-cloud")
}

// ImportBitbucketCloudAppTargets is deprecated. Use ImportTargetsParallel instead.
// Kept for backward compatibility.
func ImportBitbucketCloudAppTargets(ctx context.Context, targetsFile string, source string) error {
	return ImportTargetsParallel(ctx, targetsFile, source)
}

// FilePath is a single manifest path for scoped import (Snyk API files[]).
type FilePath struct {
	Path string `json:"path"`
}

type ImportTarget struct {
	Target        Target     `json:"target"`
	OrgID         string     `json:"orgId"`         // Note: Snyk API uses camelCase with lowercase 'i'
	IntegrationID string     `json:"integrationId"` // Note: Snyk API uses camelCase with lowercase 'i'
	Files         []FilePath `json:"files,omitempty"`
	// ExclusionGlobs: nil = omit from import API (Snyk defaults); non-nil sends value (including "").
	ExclusionGlobs *string `json:"exclusionGlobs,omitempty"`
}

// LoadImportTargetsFromFile reads and parses an import targets JSON file.
func LoadImportTargetsFromFile(targetsFile string) ([]ImportTarget, error) {
	const maxTargetsFile = 20 << 20 // 20MB
	data, err := security.SafeReadFile(targetsFile, maxTargetsFile)
	if err != nil {
		return nil, fmt.Errorf("read targets file: %w", err)
	}
	return ParseImportTargetsJSON(data)
}

// ParseImportTargetsJSON parses import targets from JSON (array or {"targets":[]}).
func ParseImportTargetsJSON(data []byte) ([]ImportTarget, error) {
	var targets []ImportTarget
	if err := json.Unmarshal(data, &targets); err == nil {
		return targets, nil
	}
	var wrapper struct {
		Targets []ImportTarget `json:"targets"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		return nil, fmt.Errorf("unmarshal targets: %w", err)
	}
	return wrapper.Targets, nil
}

type Target struct {
	ID         int    `json:"id,omitempty"` // GitLab project ID (numeric)
	Fork       bool   `json:"fork,omitempty"`
	Name       string `json:"name,omitempty"`       // GitHub repo name
	FullName   string `json:"full_name,omitempty"`  // GitHub full name (owner/repo)
	Owner      string `json:"owner,omitempty"`      // GitHub owner
	Branch     string `json:"branch"`               // Required for all sources
	ProjectKey string `json:"projectKey,omitempty"` // Bitbucket Server project key
	RepoSlug   string `json:"repoSlug,omitempty"`   // Bitbucket Server repo slug
}

func GenerateImportTargets(ctx context.Context, orgsFile, source string) ([]ImportTarget, error) {
	return GenerateImportTargetsWithLogPath(ctx, orgsFile, source, "")
}

func GenerateImportTargetsWithLogPath(ctx context.Context, orgsFile, source, logPath string) ([]ImportTarget, error) {
	// Ensure the orgs file path is resolved/safe before reading
	resolvedOrgsFile, err := ResolveSafePathWithLogPath(orgsFile, logPath)
	if err != nil {
		return nil, fmt.Errorf("resolve orgs file: %w", err)
	}
	data, err := security.SafeReadFile(resolvedOrgsFile, 10<<20)
	if err != nil {
		return nil, fmt.Errorf("read orgs file: %w", err)
	}
	var orgs struct {
		Orgs []struct {
			Name        string `json:"name"`
			GroupID     string `json:"groupId"`     // Note: Snyk API uses camelCase with lowercase 'i'
			SourceOrgID string `json:"sourceOrgId"` // Note: Snyk API uses camelCase with lowercase 'i'
		} `json:"orgs"`
	}
	if err := json.Unmarshal(data, &orgs); err != nil {
		return nil, fmt.Errorf("unmarshal orgs: %w", err)
	}

	// Build lookup maps so we can resolve per-workspace Snyk org ids.
	// Accept two possible input shapes:
	// - { "orgs": [ { name, groupID, sourceOrgID } ] }
	// - { "orgData": [ { id, name, slug, group: { id, name }, ... } ] }
	nameToSource := make(map[string]string)
	nameToGroup := make(map[string]string)
	if len(orgs.Orgs) > 0 {
		for _, o := range orgs.Orgs {
			if o.SourceOrgID != "" {
				nameToSource[o.Name] = o.SourceOrgID
			}
			if o.GroupID != "" {
				nameToGroup[o.Name] = o.GroupID
			}
		}
	} else {
		// try alternate shape used by some commands (snyk-created-orgs.json)
		var alt struct {
			OrgData []struct {
				Created string `json:"created"`
				Group   struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"group"`
				ID   string `json:"id"`
				Name string `json:"name"`
				Slug string `json:"slug"`
				URL  string `json:"url"`
			} `json:"orgData"`
		}
		if err := json.Unmarshal(data, &alt); err == nil {
			// Populate both the lookup maps AND the orgs.Orgs slice
			// so iteration over orgs.Orgs works for all sources
			for _, a := range alt.OrgData {
				if a.ID != "" {
					nameToSource[a.Name] = a.ID
				}
				if a.Group.ID != "" {
					nameToGroup[a.Name] = a.Group.ID
				}
				// Add to orgs.Orgs slice for iteration
				orgs.Orgs = append(orgs.Orgs, struct {
					Name        string `json:"name"`
					GroupID     string `json:"groupId"`     // Note: Snyk API uses camelCase with lowercase 'i'
					SourceOrgID string `json:"sourceOrgId"` // Note: Snyk API uses camelCase with lowercase 'i'
				}{
					Name:        a.Name,
					GroupID:     a.Group.ID,
					SourceOrgID: a.ID,
				})
			}
		}
	}
	orgID := os.Getenv("ORG_ID")
	integrationID := os.Getenv("INTEGRATION_ID")
	clientID := os.Getenv("BITBUCKET_APP_CLIENT_ID")
	clientSecret := os.Getenv("BITBUCKET_APP_CLIENT_SECRET")
	targets := []ImportTarget{}
	if source == "bitbucket-cloud-app" {
		// Fetch all workspaces from Bitbucket API, then list repos for each workspace
		token, err := FetchBitbucketAppToken(ctx, clientID, clientSecret)
		if err != nil {
			return nil, fmt.Errorf("fetch bitbucket app token: %w", err)
		}
		workspaces, err := FetchBitbucketAppWorkspaces(ctx, token)
		if err != nil {
			return nil, fmt.Errorf("fetch bitbucket workspaces: %w", err)
		}
		for _, ws := range workspaces {
			repos, err := FetchBitbucketAppRepos(ctx, token, ws)
			if err != nil {
				Logger.Warnf("Failed to fetch repos for workspace '%s': %v", ws, err)
				continue
			}
			for _, repo := range repos {
				branch := repo.Branch
				// Fetch default branch from repo details if not present
				if branch == "" {
					if b, err := FetchBitbucketRepoDefaultBranch(ctx, token, ws, repo.Name); err == nil && b != "" {
						branch = b
					}
				}
				// Determine the Snyk org id to use for this workspace. Preference order:
				// 1) mapping in orgs file / orgData (SourceOrgId or id)
				// 2) infer by calling FetchSnykOrgs on the group's GroupId and matching by name/slug
				// 3) fallback to global ORG_ID env
				perOrgID := orgID
				// prefer explicit source mapping from either orgs or orgData
				if v, ok := nameToSource[ws]; ok && v != "" {
					perOrgID = v
				} else if g, ok := nameToGroup[ws]; ok && g != "" {
					// try to fetch snyk orgs for the group and match by name/slug
					if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
						for _, fo := range fetched {
							if fo.Name == ws || fo.Slug == ws {
								perOrgID = fo.ID
								break
							}
						}
					} else {
						Logger.Debugf("Failed to fetch snyk orgs for group %s: %v", g, err)
					}
				}

				// ensure we have an integrationID; if missing, try to query Snyk for this per-org id
				iid := integrationID
				if iid == "" && perOrgID != "" {
					// map CLI source to Snyk integration key when they differ
					integrationKey := "bitbucket-connect-app"
					if res, err := ListIntegrations(ctx, perOrgID); err == nil {
						if v, ok := res[integrationKey]; ok {
							iid = v
						}
					} else {
						Logger.Debugf("Failed to lookup integrations for org %s: %v", perOrgID, err)
					}
				}

				targets = append(targets, ImportTarget{
					Target: Target{
						Fork:     false,
						Name:     repo.Name,
						FullName: repo.FullName,
						Owner:    ws,
						Branch:   branch,
					},
					OrgID:         perOrgID,
					IntegrationID: iid,
				})
			}
		}
	} else if source == "bitbucket-cloud" {
		Logger.Infof("Generating import targets for bitbucket-cloud source")

		// Fetch all workspaces from Bitbucket Cloud API using Basic Auth / API token
		auth, err := GetBitbucketCloudAuth()
		if err != nil {
			return nil, fmt.Errorf("get bitbucket cloud auth: %w", err)
		}
		Logger.Infof("Using Bitbucket Cloud auth method: %s", auth.Method)

		workspaces, err := FetchBitbucketCloudWorkspaces(ctx, auth)
		if err != nil {
			return nil, fmt.Errorf("fetch bitbucket cloud workspaces: %w", err)
		}
		Logger.Infof("Found %d workspaces: %v", len(workspaces), workspaces)

		for _, ws := range workspaces {
			Logger.Infof("Fetching repos for workspace: %s", ws)

			// Use simple repo listing (no manifest discovery) - let Snyk handle manifest detection
			repos, err := FetchRepos(ctx, auth, ws)
			if err != nil {
				Logger.Warnf("Failed to fetch repos for workspace '%s': %v", ws, err)
				continue
			}

			Logger.Infof("Workspace %s: found %d repositories", ws, len(repos))

			for _, repo := range repos {
				branch := repo.Branch
				// Fetch default branch from repo details if not present
				if branch == "" {
					if b, err := FetchBitbucketCloudRepoDefaultBranch(ctx, auth, ws, repo.Name); err == nil && b != "" {
						branch = b
					}
				}

				// Determine the Snyk org id to use for this workspace
				perOrgID := orgID
				if v, ok := nameToSource[ws]; ok && v != "" {
					perOrgID = v
				} else if g, ok := nameToGroup[ws]; ok && g != "" {
					if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
						for _, fo := range fetched {
							if fo.Name == ws || fo.Slug == ws {
								perOrgID = fo.ID
								break
							}
						}
					} else {
						Logger.Debugf("Failed to fetch snyk orgs for group %s: %v", g, err)
					}
				}

				// Get integrationID
				iid := integrationID
				if iid == "" && perOrgID != "" {
					integrationKey := "bitbucket-cloud"
					if res, err := ListIntegrations(ctx, perOrgID); err == nil {
						if v, ok := res[integrationKey]; ok {
							iid = v
						}
					} else {
						Logger.Debugf("Failed to lookup integrations for org %s: %v", perOrgID, err)
					}
				}

				targets = append(targets, ImportTarget{
					Target: Target{
						Fork:     false,
						Name:     repo.Name,
						FullName: repo.FullName,
						Owner:    ws,
						Branch:   branch,
					},
					OrgID:         perOrgID,
					IntegrationID: iid,
				})
			}
		}
	} else if source == "github" || source == "github-com" || source == "github-enterprise" {
		Logger.Infof("Generating import targets for GitHub source: %s", source)

		// Get GitHub authentication (PAT)
		auth, err := GetGitHubAuth()
		if err != nil {
			return nil, fmt.Errorf("get GitHub auth: %w", err)
		}

		// Process only orgs from the orgs file (not all orgs the user has access to)
		Logger.Infof("Processing %d organizations from orgs file", len(orgs.Orgs))

		for _, org := range orgs.Orgs {
			orgName := org.Name
			Logger.Infof("Fetching repos for GitHub org: %s", orgName)

			// Fetch repositories for this organization
			repos, err := FetchGitHubRepos(ctx, auth, orgName, nil)
			if err != nil {
				Logger.Warnf("Failed to fetch repos for org '%s': %v", orgName, err)
				continue
			}

			Logger.Infof("GitHub org %s: found %d repositories", orgName, len(repos))

			for _, repo := range repos {
				// Determine the Snyk org id to use for this GitHub org
				perOrgID := orgID
				if v, ok := nameToSource[orgName]; ok && v != "" {
					perOrgID = v
				} else if g, ok := nameToGroup[orgName]; ok && g != "" {
					if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
						for _, fo := range fetched {
							if fo.Name == orgName || fo.Slug == orgName {
								perOrgID = fo.ID
								break
							}
						}
					} else {
						Logger.Debugf("Failed to fetch snyk orgs for group %s: %v", g, err)
					}
				}

				// Get integrationID
				iid := integrationID
				if iid == "" && perOrgID != "" {
					integrationKey := "github"
					if source == "github-enterprise" {
						integrationKey = "github-enterprise"
					}
					if res, err := ListIntegrations(ctx, perOrgID); err == nil {
						if v, ok := res[integrationKey]; ok {
							iid = v
						}
					} else {
						Logger.Debugf("Failed to lookup integrations for org %s: %v", perOrgID, err)
					}
				}

				branch := repo["branch"]
				if branch == "" {
					branch = "main"
				}

				targets = append(targets, ImportTarget{
					Target: Target{
						Fork:     false,
						Name:     repo["name"],
						FullName: repo["owner"] + "/" + repo["name"],
						Owner:    repo["owner"],
						Branch:   branch,
					},
					OrgID:         perOrgID,
					IntegrationID: iid,
				})
			}
		}
	} else if source == "github-cloud-app" {
		Logger.Infof("Generating import targets for GitHub App source")

		// Get GitHub App authentication
		config, err := GetGitHubAppConfig()
		if err != nil {
			return nil, fmt.Errorf("get GitHub App config: %w", err)
		}

		token, err := FetchGitHubAppToken(ctx, config)
		if err != nil {
			return nil, fmt.Errorf("fetch GitHub App token: %w", err)
		}

		// Process only orgs from the orgs file (not all installations)
		Logger.Infof("Processing %d organizations from orgs file", len(orgs.Orgs))

		for _, org := range orgs.Orgs {
			orgName := org.Name
			Logger.Infof("Fetching repos for GitHub App org: %s", orgName)

			// Fetch repositories for this organization
			repos, err := FetchGitHubAppRepos(ctx, token, orgName, nil)
			if err != nil {
				Logger.Warnf("Failed to fetch repos for org '%s': %v", orgName, err)
				continue
			}

			Logger.Infof("GitHub App org %s: found %d repositories", orgName, len(repos))

			for _, repo := range repos {
				// Determine the Snyk org id to use for this GitHub org
				perOrgID := orgID
				if v, ok := nameToSource[orgName]; ok && v != "" {
					perOrgID = v
				} else if g, ok := nameToGroup[orgName]; ok && g != "" {
					if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
						for _, fo := range fetched {
							if fo.Name == orgName || fo.Slug == orgName {
								perOrgID = fo.ID
								break
							}
						}
					} else {
						Logger.Debugf("Failed to fetch snyk orgs for group %s: %v", g, err)
					}
				}

				// Get integrationID
				iid := integrationID
				if iid == "" && perOrgID != "" {
					integrationKey := "github-cloud-app"
					if res, err := ListIntegrations(ctx, perOrgID); err == nil {
						if v, ok := res[integrationKey]; ok {
							iid = v
						}
					} else {
						Logger.Debugf("Failed to lookup integrations for org %s: %v", perOrgID, err)
					}
				}

				branch := repo["branch"]
				if branch == "" {
					branch = "main"
				}

				targets = append(targets, ImportTarget{
					Target: Target{
						Fork:     false,
						Name:     repo["name"],
						FullName: repo["owner"] + "/" + repo["name"],
						Owner:    repo["owner"],
						Branch:   branch,
					},
					OrgID:         perOrgID,
					IntegrationID: iid,
				})
			}
		}
	} else if source == "gitlab" {
		Logger.Infof("Generating import targets for gitlab source")

		// Fetch all GitLab groups
		auth, err := GetGitLabAuth()
		if err != nil {
			return nil, fmt.Errorf("get gitlab auth: %w", err)
		}
		Logger.Infof("Using GitLab instance: %s", auth.BaseURL)

		groups, err := ListGitLabGroups(ctx, auth)
		if err != nil {
			return nil, fmt.Errorf("fetch gitlab groups: %w", err)
		}
		Logger.Infof("Found %d groups", len(groups))

		for _, group := range groups {
			Logger.Infof("Fetching projects for group: %s", group.FullPath)

			repos, err := ListGitLabRepos(ctx, auth, group.FullPath)
			if err != nil {
				Logger.Warnf("Failed to fetch repos for group '%s': %v", group.FullPath, err)
				continue
			}

			Logger.Infof("Group %s: found %d projects", group.FullPath, len(repos))

			for _, repo := range repos {
				// Determine the Snyk org id to use for this group
				perOrgID := orgID
				if v, ok := nameToSource[group.FullPath]; ok && v != "" {
					perOrgID = v
				} else if g, ok := nameToGroup[group.FullPath]; ok && g != "" {
					if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
						for _, fo := range fetched {
							if fo.Name == group.FullPath || fo.Slug == group.FullPath {
								perOrgID = fo.ID
								break
							}
						}
					} else {
						Logger.Debugf("Failed to fetch snyk orgs for group %s: %v", g, err)
					}
				}

				// Get integrationID
				iid := integrationID
				if iid == "" && perOrgID != "" {
					integrationKey := "gitlab"
					if res, err := ListIntegrations(ctx, perOrgID); err == nil {
						if v, ok := res[integrationKey]; ok {
							iid = v
						}
					} else {
						Logger.Debugf("Failed to lookup integrations for org %s: %v", perOrgID, err)
					}
				}

				targets = append(targets, ImportTarget{
					Target: Target{
						ID:     repo.ID, // GitLab requires numeric project ID
						Branch: repo.DefaultBranch,
						// GitLab only needs ID and branch, but include these for logging/debugging
						Name:     repo.Name,
						FullName: repo.PathWithNamespace,
						Owner:    group.FullPath,
					},
					OrgID:         perOrgID,
					IntegrationID: iid,
				})
			}
		}
	} else if source == "azure-repos" {
		Logger.Infof("Generating import targets for azure-repos source")

		// Fetch Azure DevOps auth
		auth, err := GetAzureAuth()
		if err != nil {
			return nil, fmt.Errorf("get azure auth: %w", err)
		}
		Logger.Infof("Using Azure DevOps instance: %s", auth.BaseURL)

		// For Azure DevOps, the org name is required and must be provided in the orgs file
		for _, org := range orgs.Orgs {
			azureOrgName := org.Name
			Logger.Infof("Fetching projects for Azure organization: %s", azureOrgName)

			// Get all projects for this Azure organization
			projects, err := ListAzureProjects(ctx, auth, azureOrgName)
			if err != nil {
				Logger.Warnf("Failed to fetch projects for Azure org '%s': %v", azureOrgName, err)
				continue
			}

			Logger.Infof("Azure org %s: found %d projects", azureOrgName, len(projects))

			// For each project, get all repositories
			for _, project := range projects {
				repos, err := ListAzureRepos(ctx, auth, azureOrgName, project)
				if err != nil {
					Logger.Warnf("Failed to fetch repos for project '%s': %v", project.Name, err)
					continue
				}

				Logger.Debugf("Project %s: found %d repos", project.Name, len(repos))

				// Determine the Snyk org id to use for this Azure org
				perOrgID := orgID
				if v, ok := nameToSource[azureOrgName]; ok && v != "" {
					perOrgID = v
				} else if g, ok := nameToGroup[azureOrgName]; ok && g != "" {
					if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
						for _, fo := range fetched {
							if fo.Name == azureOrgName || fo.Slug == azureOrgName {
								perOrgID = fo.ID
								break
							}
						}
					} else {
						Logger.Warnf("Could not fetch Snyk orgs for group %s: %v", g, err)
					}
				}

				// Use the integration ID from environment, or auto-discover from Snyk
				iid := integrationID
				if iid == "" && perOrgID != "" {
					integrationKey := "azure-repos"
					if res, err := ListIntegrations(ctx, perOrgID); err == nil {
						if v, ok := res[integrationKey]; ok {
							iid = v
						}
					}
				}

				// Add import targets for each repo
				for _, repo := range repos {
					// For Azure, owner is the project name (Snyk's expected format)
					// full_name format: project/repo (Snyk format for Azure)
					fullName := repo["owner"] + "/" + repo["name"]

					targets = append(targets, ImportTarget{
						Target: Target{
							Name:     repo["name"],
							FullName: fullName,
							Owner:    repo["owner"], // Azure project name
							Branch:   repo["branch"],
						},
						OrgID:         perOrgID,
						IntegrationID: iid,
					})
				}
			}
		}
	} else if source == "bitbucket-server" {
		Logger.Infof("Generating import targets for bitbucket-server source")

		// Fetch Bitbucket Server auth
		auth := GetBitbucketServerAuth()
		Logger.Infof("Using Bitbucket Server instance: %s", auth.BaseURL)

		// For Bitbucket Server, the project name is required and must be provided in the orgs file
		for _, org := range orgs.Orgs {
			projectName := org.Name
			Logger.Infof("Fetching repos for Bitbucket Server project: %s", projectName)

			// Get all repos for this project
			repos, err := FetchBitbucketServerRepos(ctx, auth, projectName)
			if err != nil {
				Logger.Warnf("Failed to fetch repos for project '%s': %v", projectName, err)
				continue
			}

			Logger.Infof("Project %s: found %d repos", projectName, len(repos))

			// Determine the Snyk org id to use for this project
			perOrgID := orgID
			if v, ok := nameToSource[projectName]; ok && v != "" {
				perOrgID = v
			} else if g, ok := nameToGroup[projectName]; ok && g != "" {
				if fetched, err := FetchSnykOrgs(ctx, g); err == nil {
					for _, fo := range fetched {
						if fo.Name == projectName || fo.Slug == projectName {
							perOrgID = fo.ID
							break
						}
					}
				} else {
					Logger.Debugf("Failed to fetch snyk orgs for group %s: %v", g, err)
				}
			}

			// Ensure we have an integrationID
			iid := integrationID
			if iid == "" && perOrgID != "" {
				integrationKey := "bitbucket-server"
				if res, err := ListIntegrations(ctx, perOrgID); err == nil {
					if v, ok := res[integrationKey]; ok {
						iid = v
					}
				} else {
					Logger.Debugf("Failed to lookup integrations for org %s: %v", perOrgID, err)
				}
			}

			for _, repo := range repos {
				// Convert BitbucketServerRepoData to map format for BuildImportTargetsFromRepos
				repoMap := map[string]interface{}{
					"repoSlug":   repo.RepoSlug,
					"projectKey": repo.ProjectKey,
					"branch":     "main", // Default branch - Bitbucket Server API doesn't provide default branch in list
				}

				repoMaps := []map[string]interface{}{repoMap}
				builtTargets, err := BuildImportTargetsFromRepos(repoMaps, source, perOrgID, iid)
				if err != nil {
					Logger.Warnf("Failed to build target for repo %s: %v", repo.RepoSlug, err)
					continue
				}

				targets = append(targets, builtTargets...)
			}
		}
	} else {
		// Fallback: stub logic for other sources
		for _, org := range orgs.Orgs {
			targets = append(targets,
				ImportTarget{
					Target: Target{
						Fork:     true,
						Name:     "goof",
						FullName: org.Name + "/goof",
						Owner:    org.Name,
						Branch:   "main",
					},
					OrgID:         orgID,
					IntegrationID: integrationID,
				},
				ImportTarget{
					Target: Target{
						Fork:     true,
						Name:     "nodejs-goof",
						FullName: org.Name + "/nodejs-goof",
						Owner:    org.Name,
						Branch:   "main",
					},
					OrgID:         orgID,
					IntegrationID: integrationID,
				},
			)
		}
	}
	return targets, nil
}

// pollImportJob polls the given URL until the job completes or fails, then
// writes import-job-results and imported/failed-projects logs accordingly.
// It returns an error on network or unexpected response; logging is best-effort.
func pollImportJob(ctx context.Context, client *security.Client, pollingURL, orgID, integrationID string, target Target, logPath, token string, timeout time.Duration) error {
	if pollingURL == "" || logPath == "" {
		return nil
	}
	// Normalize pollingURL: if it's a path (starts with /api/v1 or api/v1) prepend SNYK_API base
	base := GetSnykAPIBaseURL()
	if strings.HasPrefix(pollingURL, "api/v1/") {
		pollingURL = base + "/" + pollingURL
	} else if strings.HasPrefix(pollingURL, "/api/v1/") {
		pollingURL = base + pollingURL
	}
	deadline := time.Now().Add(timeout)
	// Match TypeScript implementation: poll every 20 seconds (not 250ms!)
	// Polling too frequently causes connection exhaustion and timeouts
	// Allow override via SNYK_POLL_INTERVAL_MS for testing (default 20000ms)
	reqInterval := 20 * time.Second
	if pollMs := os.Getenv("SNYK_POLL_INTERVAL_MS"); pollMs != "" {
		if ms, err := time.ParseDuration(pollMs + "ms"); err == nil && ms > 0 {
			reqInterval = ms
		}
	}
	// Use a shorter retry config for polling since the poll loop itself is a retry mechanism.
	// This handles transient errors (429, 5xx) within each poll attempt.
	pollRetryCfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 500 * time.Millisecond,
		MaxBackoff:     4 * time.Second,
		BackoffFactor:  2.0,
	}

	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(ctx, "GET", pollingURL, nil)
		if err != nil {
			return err
		}
		if token != "" {
			req.Header.Set("Authorization", token)
		}

		// Optional debug dump for poll requests; enable with SNYK_DEBUG_REQUESTS=1
		if os.Getenv("SNYK_DEBUG_REQUESTS") == "1" {
			sanitizedHeaders := security.SanitizeHeadersForLogging(req.Header)
			dump := map[string]interface{}{
				"method":  req.Method,
				"url":     req.URL.String(),
				"headers": sanitizedHeaders,
				"body":    "",
			}
			if lp := os.Getenv("SNYK_LOG_PATH"); lp != "" {
				_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.request-dump.log", lp, orgID), 20, "Poll request dump", dump)
			}
			fmt.Printf("[SNYK_DEBUG_REQUESTS] Poll request: %s %s\nHeaders: %v\n", req.Method, req.URL.String(), sanitizedHeaders)
		}

		// Use DoWithRetry for transient error handling (429, 5xx)
		resp, body, err := DoWithRetryConfig(ctx, client, req, pollRetryCfg)
		if err != nil {
			// If the error indicates an unsafe URL (URL validation), don't
			// produce a poll failure log — this is a configuration/validation
			// issue rather than a runtime poll failure.
			if strings.Contains(err.Error(), "unsafe URL") {
				return err
			}
			// Only log as failure after DoWithRetry has exhausted retries
			_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.failed-polls.log", logPath, orgID), 50, "Failed to poll import", map[string]interface{}{
				"integrationID": integrationID,
				"target":        target,
				"error":         err.Error(),
			})
			return err
		}

		// Capture diagnostic headers from Snyk responses
		snykRequestID := resp.Header.Get("snyk-request-id")
		xRequestID := resp.Header.Get("x-request-id")
		reqID := resp.Header.Get("request-id")
		headerInfo := map[string]string{
			"snyk-request-id": snykRequestID,
			"x-request-id":    xRequestID,
			"request-id":      reqID,
		}

		var jr map[string]interface{}
		if err := json.Unmarshal(body, &jr); err != nil {
			// JSON parse error - wait and retry in next poll iteration
			time.Sleep(reqInterval)
			continue
		}

		// Note: Non-2xx responses are now handled by DoWithRetry:
		// - 429/5xx are retried automatically
		// - 4xx (except 429) return immediately as non-retryable errors
		// If we get here with a non-2xx, it's a 4xx client error that shouldn't be retried
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.failed-polls.log", logPath, orgID), 50, "Failed to poll import", map[string]interface{}{
				"integrationID": integrationID,
				"target":        target,
				"status":        resp.StatusCode,
				"body":          string(body),
				"headers":       headerInfo,
			})
			return fmt.Errorf("poll returned status %d", resp.StatusCode)
		}
		status, _ := jr["status"].(string)
		_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.import-job-results.log", logPath, orgID), 30, "Import job status", map[string]interface{}{
			"integrationID": integrationID,
			"target":        target,
			"status":        status,
			"raw":           jr,
			"headers":       headerInfo,
		})
		// Snyk API returns "complete" (not "completed") - match TypeScript implementation
		// Also handle "completed" for compatibility/testing
		if status == "complete" || status == "completed" {
			// Extract projects from logs array (matches TypeScript: importStatus.logs.forEach)
			if logs, ok := jr["logs"].([]interface{}); ok {
				for _, logItem := range logs {
					if logMap, ok := logItem.(map[string]interface{}); ok {
						if projects, ok := logMap["projects"].([]interface{}); ok {
							for _, proj := range projects {
								_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.imported-projects.log", logPath, orgID), 30, "Project imported", map[string]interface{}{
									"integrationID": integrationID,
									"target":        target,
									"project":       proj,
									"headers":       headerInfo,
								})
							}
						}
					}
				}
			}
			return nil
		}
		if status == "failed" || status == "error" {
			errMsg := "import failed"
			if em, ok := jr["error"].(string); ok {
				errMsg = em
			}
			_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.failed-projects.log", logPath, orgID), 50, "Project import failed", map[string]interface{}{
				"integrationID": integrationID,
				"target":        target,
				"error":         errMsg,
				"headers":       headerInfo,
			})
			return fmt.Errorf("import job failed: %s", errMsg)
		}
		time.Sleep(reqInterval)
	}
	_ = utils.AppendBunyanJSONLine(fmt.Sprintf("%s/%s.failed-polls.log", logPath, orgID), 50, "Import poll timed out", map[string]interface{}{
		"integrationID": integrationID,
		"target":        target,
	})
	return fmt.Errorf("poll timeout")
}

// WriteImportTargetsFile writes import targets to a JSON file
func WriteImportTargetsFile(targets []ImportTarget, path string) error {
	// Validate all targets have non-empty IntegrationId for all SCMs
	for i, t := range targets {
		if t.IntegrationID == "" {
			return fmt.Errorf("import target at index %d is missing required integrationID (required for all SCMs)", i)
		}
	}
	// Resolve output path to ensure it's safe to create here and open securely.
	resolvedOut, err := ResolveSafePath(path)
	if err != nil {
		return fmt.Errorf("resolve output path: %w", err)
	}
	f, err := security.SafeOpenFile(resolvedOut, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer func() {
		if err := f.Close(); err != nil {
			Logger.Errorf("error closing file: %v", err)
		}
	}()
	output := map[string]interface{}{"targets": targets}
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(output); err != nil {
		return fmt.Errorf("write targets: %w", err)
	}

	// Also append entries to the global imported-targets.log (newline-delimited JSON)
	if logPath := os.Getenv("SNYK_LOG_PATH"); logPath != "" {
		logFile := fmt.Sprintf("%s/imported-targets.log", logPath)
		for _, t := range targets {
			_ = utils.AppendBunyanJSONLine(logFile, 30, "Target requested for import", map[string]interface{}{
				"target":        t.Target,
				"locationURL":   nil,
				"orgID":         t.OrgID,
				"integrationID": t.IntegrationID,
			})
		}
	}
	return nil
}
