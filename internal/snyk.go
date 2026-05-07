package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/sam1el/snyk-api-import-go/internal/network"
)

// GetSnykAPIBaseURL returns the Snyk API base URL from environment or default.
// Supports regional endpoints: US-01, US-02, EU-01, AU-01.
// Priority: SNYK_API env var > SNYK_API_URL env var > default (https://api.snyk.io)
func GetSnykAPIBaseURL() string {
	// SNYK_API takes precedence (used by tests and direct configuration)
	if customURL := os.Getenv("SNYK_API"); customURL != "" {
		return strings.TrimSuffix(customURL, "/")
	}
	// SNYK_API_URL is set by config.toml system
	if customURL := os.Getenv("SNYK_API_URL"); customURL != "" {
		return strings.TrimSuffix(customURL, "/")
	}
	// Default to US-01 region
	return "https://api.snyk.io"
}

// IsValidSnykAPIURL validates that a URL is a legitimate Snyk API endpoint.
// When SNYK_API or SNYK_API_URL is explicitly set (tests/on-prem), allows any URL.
// Otherwise, validates against known Snyk regional endpoints.
func IsValidSnykAPIURL(apiURL string) bool {
	// When SNYK_API or SNYK_API_URL is set (tests/on-prem deployments), allow any URL
	if os.Getenv("SNYK_API") != "" || os.Getenv("SNYK_API_URL") != "" {
		return true
	}

	// Validate against known Snyk regional endpoints
	validPrefixes := []string{
		"https://api.snyk.io/",    // US-01 (default)
		"https://api.us.snyk.io/", // US-02
		"https://api.eu.snyk.io/", // EU-01
		"https://api.au.snyk.io/", // AU-01
	}

	// Check explicit known endpoints first
	for _, prefix := range validPrefixes {
		if strings.HasPrefix(apiURL, prefix) {
			return true
		}
	}

	// For future Snyk regions, validate api.*.snyk.io pattern
	if strings.HasPrefix(apiURL, "https://api.") && strings.Contains(apiURL, ".snyk.io/") {
		return true
	}

	return false
}

// SnykOrg represents a Snyk organization (expand as needed)
type SnykOrg struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	URL           string `json:"url"`
	GroupID       string `json:"groupId"`
	IntegrationID string `json:"integrationId,omitempty"`
	// Add other fields as needed
}

// CreateOrg creates a new Snyk organization. It first attempts the v1
// endpoint (/v1/org) and if that endpoint is not available will retry
// against alternate endpoints (/orgs and /rest/orgs) to support different
// Snyk deployments.
func CreateOrg(ctx context.Context, groupID, name, sourceOrgID string) (map[string]interface{}, error) {
	return CreateOrgWithToken(ctx, groupID, name, sourceOrgID, "")
}

// CreateOrgWithToken creates a Snyk organization with an explicit token parameter.
// If token is empty, it falls back to environment variables.
func CreateOrgWithToken(ctx context.Context, groupID, name, sourceOrgID, token string) (map[string]interface{}, error) {
	if groupID == "" || name == "" {
		return nil, fmt.Errorf("groupId and name are required")
	}

	// If no token provided, try environment variables
	if token == "" {
		token = os.Getenv("SNYK_TOKEN")
		if token == "" {
			token = os.Getenv("SNYK_API_TOKEN")
		}
	}
	if token == "" {
		return nil, fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set, or token must be provided")
	}

	baseURL := GetSnykAPIBaseURL()

	// Prepare request body
	bodyMap := map[string]interface{}{
		"name":    name,
		"groupId": groupID, // Note: API expects "groupId" not "groupID"
	}
	if sourceOrgID != "" {
		bodyMap["sourceOrgId"] = sourceOrgID // Note: API expects "sourceOrgId" not "sourceOrgID"
	}
	bodyBytes, err := json.Marshal(bodyMap)
	if err != nil {
		return nil, fmt.Errorf("marshal body: %w", err)
	}

	client := network.NewClient()

	// Use the v1 endpoint as specified in the API spec
	paths := []string{"/v1/org"}
	var lastErr error
	for _, p := range paths {
		apiURL := fmt.Sprintf("%s%s", baseURL, p)
		// Validate URL against known Snyk endpoints or custom SNYK_API
		if !IsValidSnykAPIURL(apiURL) {
			// Defensive validation; skip invalid base
			continue
		}
		parsed, err := url.Parse(apiURL)
		if err != nil {
			lastErr = fmt.Errorf("invalid url %s: %w", apiURL, err)
			continue
		}
		req, err := http.NewRequestWithContext(ctx, "POST", parsed.String(), strings.NewReader(string(bodyBytes)))
		if err != nil {
			lastErr = fmt.Errorf("create request: %w", err)
			continue
		}
		req.Header.Set("Authorization", "Token "+token)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("http request to %s: %w", parsed.String(), err)
			continue
		}
		if resp == nil || resp.Body == nil {
			lastErr = fmt.Errorf("nil response from %s", parsed.String())
			continue
		}

		// Successful creation -> decode body and return.
		if resp.StatusCode == 201 || resp.StatusCode == 200 {
			var out map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
				// Close before continuing to next endpoint
				_ = resp.Body.Close()
				lastErr = fmt.Errorf("decode create response: %w", err)
				continue
			}
			_ = resp.Body.Close()
			return out, nil
		}

		// If 404 try next; otherwise capture body and return error
		if resp.StatusCode == 404 {
			_ = resp.Body.Close()
			lastErr = fmt.Errorf("endpoint %s returned 404", parsed.String())
			continue
		}
		respBody, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		return nil, fmt.Errorf("create org failed: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("failed to create org: no valid endpoint")
	}
	return nil, lastErr
}

// FetchSnykOrgs fetches orgs for a group from the Snyk REST API
func FetchSnykOrgs(ctx context.Context, groupID string) ([]SnykOrg, error) {
	// Validate groupID to prevent path traversal
	if groupID == "" {
		return nil, fmt.Errorf("groupId cannot be empty")
	}
	// Accept both numeric IDs (legacy) and UUID format (current Snyk standard)
	// UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (lowercase hex + hyphens)
	for _, c := range groupID {
		isValid := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F') || c == '-'
		if !isValid {
			return nil, fmt.Errorf("invalid groupID format")
		}
	}

	token := os.Getenv("SNYK_TOKEN")
	if token == "" {
		// Accept legacy name as fallback
		token = os.Getenv("SNYK_API_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set")
	}

	// Construct and validate the API URL
	baseURL := GetSnykAPIBaseURL()

	apiURL := fmt.Sprintf("%s/v1/group/%s/orgs", baseURL, groupID)
	if !IsValidSnykAPIURL(apiURL) {
		return nil, fmt.Errorf("invalid API URL: %s", apiURL)
	}

	client := network.NewClient()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Token "+token)
	req.Header.Set("Accept", "application/json")

	resp, body, err := DoWithRetry(ctx, client, req)
	if err != nil {
		return nil, fmt.Errorf("fetch orgs: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var response struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		URL     string `json:"url"`
		Created string `json:"created"`
		Orgs    []struct {
			Name    string `json:"name"`
			ID      string `json:"id"`
			Slug    string `json:"slug"`
			URL     string `json:"url"`
			Created string `json:"created"`
		} `json:"orgs"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	orgs := make([]SnykOrg, 0, len(response.Orgs))
	for _, o := range response.Orgs {
		orgs = append(orgs, SnykOrg{
			ID:      o.ID,
			Name:    o.Name,
			Slug:    o.Slug,
			URL:     o.URL,
			GroupID: groupID,
		})
	}
	return orgs, nil
}

// ListIntegrations lists integrations for a given Snyk org and returns a map
// where keys are the integration type keys and values are the integration IDs.
func ListIntegrations(ctx context.Context, orgID string) (map[string]string, error) {
	// Validate orgID to prevent path traversal
	if orgID == "" {
		return nil, fmt.Errorf("orgID cannot be empty")
	}
	for _, c := range orgID {
		if (c < '0' || c > '9') && (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && c != '-' {
			return nil, fmt.Errorf("invalid orgID format")
		}
	}

	token := os.Getenv("SNYK_TOKEN")
	if token == "" {
		token = os.Getenv("SNYK_API_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set")
	}

	baseURL := GetSnykAPIBaseURL()

	apiURL := fmt.Sprintf("%s/v1/org/%s/integrations", baseURL, orgID)
	// Allow test override for URL validation
	if os.Getenv("SNYK_TEST_SKIP_URL_VALIDATION") != "1" {
		if !IsValidSnykAPIURL(apiURL) {
			return nil, fmt.Errorf("invalid API URL: %s", apiURL)
		}
	}

	client := network.NewClient()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Token "+token)
	req.Header.Set("Accept", "application/json")

	resp, body, err := DoWithRetry(ctx, client, req)
	if err != nil {
		return nil, fmt.Errorf("list integrations: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var data map[string]string
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("decode integrations response: %w", err)
	}

	return data, nil
}

// ListTargets lists targets for a Snyk org, optionally filtered by origin.
// It returns a slice of generic maps representing target objects as returned
// by the Snyk REST API.
func ListTargets(ctx context.Context, orgID string, origin string) ([]map[string]interface{}, error) {
	// Validate orgID to prevent path traversal
	if orgID == "" {
		return nil, fmt.Errorf("orgID cannot be empty")
	}
	for _, c := range orgID {
		if (c < '0' || c > '9') && (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && c != '-' {
			return nil, fmt.Errorf("invalid orgID format")
		}
	}

	token := os.Getenv("SNYK_TOKEN")
	if token == "" {
		token = os.Getenv("SNYK_API_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set")
	}

	baseURL := GetSnykAPIBaseURL()

	// Build URL with version and optional origin filter (use v1 endpoint)
	apiURL := fmt.Sprintf("%s/v1/org/%s/targets?version=2022-09-15~beta", baseURL, orgID)
	if origin != "" {
		apiURL = fmt.Sprintf("%s&origin=%s", apiURL, url.QueryEscape(origin))
	}

	// Allow test override for URL validation
	if os.Getenv("SNYK_TEST_SKIP_URL_VALIDATION") != "1" {
		if !IsValidSnykAPIURL(apiURL) {
			return nil, fmt.Errorf("invalid API URL: %s", apiURL)
		}
	}

	client := network.NewClient()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Token "+token)
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, body, err := DoWithRetry(ctx, client, req)
	if err != nil {
		return nil, fmt.Errorf("list targets: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result struct {
		Data []struct {
			ID            string                 `json:"id"`
			Type          string                 `json:"type"`
			Attributes    map[string]interface{} `json:"attributes"`
			Relationships map[string]interface{} `json:"relationships"`
		} `json:"data"`
		Links map[string]interface{} `json:"links"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode targets response: %w", err)
	}

	targets := make([]map[string]interface{}, 0, len(result.Data))
	for _, d := range result.Data {
		t := map[string]interface{}{
			"id":         d.ID,
			"type":       d.Type,
			"attributes": d.Attributes,
		}
		// Try to extract integration id from attributes or relationships
		if d.Attributes != nil {
			if iid, ok := d.Attributes["originIntegrationId"].(string); ok && iid != "" {
				t["integrationID"] = iid
			} else if iid, ok := d.Attributes["integrationID"].(string); ok && iid != "" {
				t["integrationID"] = iid
			}
		}
		if _, ok := t["integrationID"]; !ok && d.Relationships != nil {
			if relRaw, ok := d.Relationships["originIntegration"]; ok {
				if relMap, ok := relRaw.(map[string]interface{}); ok {
					if dataRaw, ok := relMap["data"]; ok {
						if dataMap, ok := dataRaw.(map[string]interface{}); ok {
							if id, ok := dataMap["id"].(string); ok && id != "" {
								t["integrationID"] = id
							}
						}
					}
				}
			}
			if _, ok := t["integrationID"]; !ok {
				if relRaw, ok := d.Relationships["integration"]; ok {
					if relMap, ok := relRaw.(map[string]interface{}); ok {
						if dataRaw, ok := relMap["data"]; ok {
							if dataMap, ok := dataRaw.(map[string]interface{}); ok {
								if id, ok := dataMap["id"].(string); ok && id != "" {
									t["integrationID"] = id
								}
							}
						}
					}
				}
			}
		}
		targets = append(targets, t)
	}
	return targets, nil
}

// DeactivateProject deactivates a Snyk project by public ID.
// It performs a POST to /org/{orgID}/project/{projectPublicID}/deactivate
// and expects a 200 response on success.
func DeactivateProject(ctx context.Context, orgID, projectPublicID string) error {
	if orgID == "" || projectPublicID == "" {
		return fmt.Errorf("orgID and projectPublicID are required")
	}

	token := os.Getenv("SNYK_TOKEN")
	if token == "" {
		token = os.Getenv("SNYK_API_TOKEN")
	}
	if token == "" {
		return fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set")
	}

	baseURL := GetSnykAPIBaseURL()
	apiURL := fmt.Sprintf("%s/v1/org/%s/project/%s/deactivate", baseURL, url.PathEscape(orgID), url.PathEscape(projectPublicID))

	client := network.NewClient()

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader("{}"))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Token "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, body, err := DoWithRetry(ctx, client, req)
	if err != nil {
		return fmt.Errorf("deactivate project: %w", err)
	}

	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected status: %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// UpdateProjectBranch updates a Snyk project's branch using the V1 API.
// It performs a PUT to /v1/org/{orgID}/project/{projectID}
// and expects a 200 response on success.
func UpdateProjectBranch(ctx context.Context, orgID, projectID, newBranch string) error {
	if orgID == "" || projectID == "" || newBranch == "" {
		return fmt.Errorf("orgID, projectID, and newBranch are required")
	}

	token := os.Getenv("SNYK_TOKEN")
	if token == "" {
		token = os.Getenv("SNYK_API_TOKEN")
	}
	if token == "" {
		return fmt.Errorf("SNYK_TOKEN or SNYK_API_TOKEN environment variable not set")
	}

	baseURL := GetSnykAPIBaseURL()
	apiURL := fmt.Sprintf("%s/v1/org/%s/project/%s",
		baseURL, url.PathEscape(orgID), url.PathEscape(projectID))

	requestBody := map[string]interface{}{
		"branch": newBranch,
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("marshal request body: %w", err)
	}

	client := network.NewClient()

	req, err := http.NewRequestWithContext(ctx, "PUT", apiURL, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	Logger.Debugf("PUT %s with body: %s", apiURL, string(bodyBytes))

	resp, body, err := DoWithRetry(ctx, client, req)
	if err != nil {
		return fmt.Errorf("update project branch: %w", err)
	}

	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected status: %d, body: %s", resp.StatusCode, string(body))
	}

	Logger.Debugf("Successfully updated project %s to branch %s", projectID, newBranch)
	return nil
}

// BranchUpdateJob represents a single branch update operation
type BranchUpdateJob struct {
	ProjectID string
	OldBranch string
	NewBranch string
}

// BulkUpdateBranchesResult represents the outcome of a bulk branch update operation.
type BulkUpdateBranchesResult struct {
	Success []string          `json:"success"` // projectID
	Failed  map[string]string `json:"failed"`  // projectID -> error
}

// BulkUpdateProjectBranches updates the target_reference (branch) for multiple projects.
// When dryRun is true, no network calls are performed and the function returns
// the list of planned updates in Success.
// The function performs updates concurrently with a small worker pool.
// Retry logic is handled by the underlying UpdateProjectBranch function.
func BulkUpdateProjectBranches(ctx context.Context, orgID string, jobs []BranchUpdateJob, dryRun bool) (BulkUpdateBranchesResult, error) {
	result := BulkUpdateBranchesResult{Success: []string{}, Failed: map[string]string{}}
	if orgID == "" {
		return result, fmt.Errorf("orgID is required")
	}
	if len(jobs) == 0 {
		return result, nil
	}

	if dryRun {
		for _, job := range jobs {
			result.Success = append(result.Success, job.ProjectID)
		}
		return result, nil
	}

	workers := 4
	jobsChan := make(chan BranchUpdateJob, len(jobs))
	var wg sync.WaitGroup
	var mu sync.Mutex

	worker := func() {
		defer wg.Done()
		for job := range jobsChan {
			err := UpdateProjectBranch(ctx, orgID, job.ProjectID, job.NewBranch)
			mu.Lock()
			if err == nil {
				result.Success = append(result.Success, job.ProjectID)
				Logger.Infof("Updated project %s: %s -> %s", job.ProjectID, job.OldBranch, job.NewBranch)
			} else {
				result.Failed[job.ProjectID] = err.Error()
				Logger.Errorf("Failed to update project %s branch %s -> %s: %v", job.ProjectID, job.OldBranch, job.NewBranch, err)
			}
			mu.Unlock()
		}
	}

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go worker()
	}

	for _, job := range jobs {
		jobsChan <- job
	}
	close(jobsChan)

	wg.Wait()
	return result, nil
}

// BulkDeactivateResult represents the outcome of a bulk deactivate operation.
type BulkDeactivateResult struct {
	Success []string          `json:"success"`
	Failed  map[string]string `json:"failed"` // projectID -> error
}

// BulkDeactivateProjects deactivates a list of project public IDs for the given org.
// When dryRun is true, no network calls are performed and the function returns
// the list of planned deactivations in Success.
// The function performs deactivations concurrently with a small worker pool.
// Retry logic is handled by the underlying DeactivateProject function.
func BulkDeactivateProjects(ctx context.Context, orgID string, projectPublicIds []string, dryRun bool) (BulkDeactivateResult, error) {
	result := BulkDeactivateResult{Success: []string{}, Failed: map[string]string{}}
	if orgID == "" {
		return result, fmt.Errorf("orgID is required")
	}
	if len(projectPublicIds) == 0 {
		return result, nil
	}

	if dryRun {
		result.Success = append(result.Success, projectPublicIds...)
		return result, nil
	}

	workers := 4
	jobs := make(chan string, len(projectPublicIds))
	var wg sync.WaitGroup
	var mu sync.Mutex

	worker := func() {
		defer wg.Done()
		for pid := range jobs {
			err := DeactivateProject(ctx, orgID, pid)
			mu.Lock()
			if err == nil {
				result.Success = append(result.Success, pid)
			} else {
				result.Failed[pid] = err.Error()
			}
			mu.Unlock()
		}
	}

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go worker()
	}

	for _, p := range projectPublicIds {
		jobs <- p
	}
	close(jobs)

	wg.Wait()
	return result, nil
}
