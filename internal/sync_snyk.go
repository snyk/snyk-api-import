package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/snyk/snyk-api-import/internal/network"
)

// FetchSnykProjects fetches all projects for a Snyk org, including manifest file info.
func FetchSnykProjects(ctx context.Context, orgID, snykToken string, manifestTypes []string) ([]map[string]string, error) {
	// Use the REST API projects endpoint (matches the TypeScript client)
	// Note: the REST endpoint uses the plural `orgs` path with
	// `version=2025-09-28` to match the REST API contract.
	apiBase := GetSnykAPIBaseURL()
	baseURL := fmt.Sprintf("%s/rest/orgs/%s/projects?version=2025-09-28", apiBase, url.PathEscape(orgID))
	client := network.NewClient()
	projects := make([]map[string]string, 0)
	nextURL := baseURL

	for nextURL != "" {
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Authorization", snykToken)
		req.Header.Set("Accept", "application/vnd.api+json")

		// Use centralized rate limiting and retry logic
		resp, body, err := DoWithRetry(ctx, client, req)
		if err != nil {
			return nil, fmt.Errorf("fetch projects: %w", err)
		}

		if resp.StatusCode == 404 {
			return nil, fmt.Errorf("org not found or no projects (404)")
		}
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("unexpected status: %d, body: %s", resp.StatusCode, string(body))
		}

		var result struct {
			Data []struct {
				ID         string                 `json:"id"`
				Type       string                 `json:"type"`
				Attributes map[string]interface{} `json:"attributes"`
			} `json:"data"`
			Links map[string]interface{} `json:"links"`
		}
		if unmarshalErr := json.Unmarshal(body, &result); unmarshalErr != nil {
			return nil, fmt.Errorf("unmarshal: %w", unmarshalErr)
		}
		for _, p := range result.Data {
			attrs := p.Attributes
			name, _ := attrs["name"].(string)

			// Normalize attributes (accept both camelCase and snake_case shapes)
			branch, manifest, targetReference, include := normalizeSnykAttributes(attrs, name, manifestTypes)
			if !include {
				// filtered by manifestTypes
				continue
			}
			Logger.Debugf("SnykProject attrs: %+v", attrs)

			// Extract the actual project type from attributes (e.g., "gomodules", "maven", "terraformconfig")
			projectType := p.Type // default to JSON-API type
			if typeAttr, ok := attrs["type"].(string); ok && typeAttr != "" {
				projectType = typeAttr
			}

			// Extract status (active/inactive)
			status := "active" // default
			if statusAttr, ok := attrs["status"].(string); ok && statusAttr != "" {
				status = statusAttr
			}

			project := map[string]string{
				"id":       p.ID,
				"type":     projectType,
				"name":     name,
				"branch":   branch,
				"manifest": manifest,
				"status":   status,
			}
			if targetReference != "" {
				project["targetReference"] = targetReference
			}
			projects = append(projects, project)
		}
		// Pagination: look for next link (validate to avoid SSRF)
		nextURL = ""
		if result.Links != nil {
			if nextRaw, ok := result.Links["next"]; ok {
				if nextStr, ok := nextRaw.(string); ok && nextStr != "" {
					// Extract host from base URL for validation
					baseHost := "api.snyk.io" // default
					if parsedBase, err := url.Parse(apiBase); err == nil && parsedBase.Host != "" {
						baseHost = parsedBase.Host
					}
					if isAllowedNextURL(nextStr, baseHost) {
						// If it's a relative URL, construct full URL
						if strings.HasPrefix(nextStr, "/") {
							nextURL = apiBase + nextStr
						} else {
							nextURL = nextStr
						}
					} else {
						Logger.Warnf("ignoring disallowed next URL from Snyk API: %s", nextStr)
					}
				}
			}
		}
	}
	return projects, nil
}
