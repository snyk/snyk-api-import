package cmd

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sam1el/snyk-api-import-go/internal"
	"github.com/sam1el/snyk-api-import-go/internal/logging"
	"github.com/sam1el/snyk-api-import-go/internal/security"
	"github.com/sam1el/snyk-api-import-go/internal/utils"
)

// OrgsCreateCmd reads a local orgs file and creates orgs in Snyk if missing.
// All file accesses are restricted to SNYK_LOG_PATH via ResolveSafePath and
// SafeReadFile/SafeOpenFile to satisfy static analysis and prevent path traversal.
func OrgsCreateCmd(ctx context.Context, cfg internal.AppConfig) {
	fs := flag.NewFlagSet("orgs:create", flag.ExitOnError)
	file := fs.String("file", "", "Path to orgs file")
	noDuplicateNames := fs.Bool("noDuplicateNames", false, "Skip org creation if an org with the same name already exists")
	includeExistingOrgsInOutput := fs.Bool("includeExistingOrgsInOutput", true, "Include existing orgs in output file even if not newly created")
	if err := fs.Parse(os.Args[2:]); err != nil {
		logging.Errorf("Error parsing flags: %v", err)
		return
	}

	snykLogPath := cfg.SnykLogPath
	if snykLogPath == "" {
		snykLogPath = os.Getenv("SNYK_LOG_PATH")
	}
	if *file == "" {
		logging.ValidationErrorf("--file is required")
		return
	}

	// Resolve and read the input orgs file safely
	resolvedFile, err := internal.ResolveSafePath(*file)
	if err != nil {
		logging.Errorf("file path is not allowed or may be unsafe: %v", err)
		return
	}
	data, err := security.SafeReadFile(resolvedFile, 5<<20)
	if err != nil {
		logging.Errorf("failed to read orgs file: %v", err)
		return
	}

	// Parse input orgs
	type Org struct {
		Name        string `json:"name"`
		GroupID     string `json:"groupId"`               // Note: Snyk API uses camelCase with lowercase 'i'
		SourceOrgID string `json:"sourceOrgId,omitempty"` // Note: Snyk API uses camelCase with lowercase 'i'
	}
	var orgsFile struct {
		Orgs []Org `json:"orgs"`
	}
	if err := json.NewDecoder(strings.NewReader(string(data))).Decode(&orgsFile); err != nil {
		logging.Errorf("Failed to parse orgs file: %v", err)
		return
	}
	if len(orgsFile.Orgs) == 0 {
		logging.Infof("No orgs found in input file.")
		return
	}
	groupID := orgsFile.Orgs[0].GroupID
	if groupID == "" {
		logging.Errorf("groupID in orgs file is empty")
		return
	}

	// Load existing created orgs (if any) from SNYK_LOG_PATH
	existingOrgs := map[string]struct{}{}
	existingSlugs := map[string]struct{}{}
	if snykLogPath != "" {
		orgsJSONPath := filepath.Join(snykLogPath, "snyk-created-orgs.json")
		if resolvedOrgsJSON, err := internal.ResolveSafePath(orgsJSONPath); err == nil {
			if data2, err := security.SafeReadFile(resolvedOrgsJSON, 2<<20); err == nil {
				var orgsFile2 struct {
					OrgData []struct {
						Name string `json:"name"`
						Slug string `json:"slug"`
					} `json:"orgData"`
				}
				if err := json.NewDecoder(strings.NewReader(string(data2))).Decode(&orgsFile2); err == nil {
					for _, o := range orgsFile2.OrgData {
						existingOrgs[o.Name] = struct{}{}
						existingSlugs[o.Slug] = struct{}{}
					}
				}
			}
		}
	}

	// Fetch current Snyk orgs for the group to avoid duplicates
	snykOrgs, err := internal.FetchSnykOrgs(ctx, groupID)
	snykOrgNames := map[string]struct{}{}
	snykOrgSlugs := map[string]struct{}{}
	if err == nil {
		for _, o := range snykOrgs {
			snykOrgNames[o.Name] = struct{}{}
			snykOrgSlugs[o.Slug] = struct{}{}
		}
	}

	// Create missing orgs via Snyk API using secure HTTP client
	token := cfg.SnykToken
	if token == "" {
		token = os.Getenv("SNYK_TOKEN")
	}
	if token == "" {
		logging.Errorf("SNYK_TOKEN environment variable not set")
		return
	}
	// Debug: Show only first 4 chars of token (security: minimize exposure)
	if len(token) >= 4 {
		logging.Infof("Using token: %s***", token[:4])
	}
	created := make([]map[string]interface{}, 0)
	for _, org := range orgsFile.Orgs {
		// Check if org exists in local cache
		if _, exists := existingOrgs[org.Name]; exists {
			logging.Infof("Org already in local cache: %s", org.Name)
			if *includeExistingOrgsInOutput {
				// Add existing org to output (we'll need to fetch details from Snyk)
				if existingOrg, found := findOrgInSnyk(snykOrgs, org.Name); found {
					created = append(created, existingOrg)
				}
			}
			continue
		}

		// Check if org exists in Snyk
		if _, exists := snykOrgNames[org.Name]; exists {
			if *noDuplicateNames {
				logging.Infof("Skipping duplicate org in Snyk: %s", org.Name)
				if *includeExistingOrgsInOutput {
					// Add existing org to output
					if existingOrg, found := findOrgInSnyk(snykOrgs, org.Name); found {
						created = append(created, existingOrg)
					}
				}
				continue
			} else {
				logging.Infof("Org exists in Snyk but --noDuplicateNames=false, attempting to create: %s", org.Name)
			}
		}

		// Use helper to create org with fallback endpoints. This will include
		// optional sourceOrgID if present and return the created org response.
		// Pass the token explicitly so it uses config.toml token if available.
		createdOrg, err := internal.CreateOrgWithToken(ctx, org.GroupID, org.Name, org.SourceOrgID, token)
		if err != nil {
			logging.Errorf("Failed to create org via Snyk API: %v", err)
			continue
		}
		created = append(created, createdOrg)
	}

	// Write created orgs back to SNYK_LOG_PATH
	if snykLogPath != "" {
		outFilePath := filepath.Join(snykLogPath, "snyk-created-orgs.json")
		resolvedOut, err := internal.ResolveSafePath(outFilePath)
		if err != nil {
			logging.Errorf("Refusing to write orgs file to unsafe path: %v", err)
			return
		}
		outFile, err := security.SafeOpenFile(resolvedOut, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
		if err != nil {
			logging.Errorf("Failed to open output file: %v", err)
			return
		}
		defer func() {
			if cerr := outFile.Close(); cerr != nil {
				logging.Errorf("Failed to close output file: %v", cerr)
			}
		}()
		output := map[string]interface{}{"orgData": created}
		enc := json.NewEncoder(outFile)
		enc.SetIndent("", "  ")
		if err := enc.Encode(output); err != nil {
			logging.Errorf("Failed to write output file: %v", err)
			return
		}
		logging.Infof("Snyk orgs created written to %s", outFilePath)

		// Also append each created org to per-group created-orgs.log (newline-delimited JSON)
		if groupID != "" {
			createdLog := filepath.Join(snykLogPath, groupID+".created-orgs.log")
			for _, c := range created {
				// Normalize shape to match TS: { name, id, created, integrations, msg, time, v }
				entry := map[string]interface{}{}
				if name, ok := c["name"].(string); ok {
					entry["name"] = name
				}
				if id, ok := c["id"].(string); ok {
					entry["id"] = id
				}
				if createdAt, ok := c["created"].(string); ok {
					entry["created"] = createdAt
				}
				// integrations may be a map or slice; normalize to []string
				if ints, ok := c["integrations"].([]interface{}); ok {
					outInts := []string{}
					for _, ii := range ints {
						outInts = append(outInts, fmt.Sprintf("%v", ii))
					}
					entry["integrations"] = outInts
				} else if intsMap, ok := c["integrations"].(map[string]interface{}); ok {
					outInts := []string{}
					for k, v := range intsMap {
						outInts = append(outInts, fmt.Sprintf("%s:%v", k, v))
					}
					entry["integrations"] = outInts
				}
				entry["msg"] = "Created org"
				// Use bunyan envelope for consistency with TS-produced logs
				_ = utils.AppendBunyanJSONLine(createdLog, 30, "Created org", entry)
			}
		}
	}
}

// findOrgInSnyk searches for an org by name in the Snyk orgs list and returns it as a map
func findOrgInSnyk(snykOrgs []internal.SnykOrg, name string) (map[string]interface{}, bool) {
	for _, org := range snykOrgs {
		if org.Name == name {
			result := map[string]interface{}{
				"name": org.Name,
				"id":   org.ID,
				"slug": org.Slug,
			}
			return result, true
		}
	}
	return nil, false
}
