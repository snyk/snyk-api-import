package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/snyk/snyk-api-import/internal/security"
	"github.com/snyk/snyk-api-import/internal/utils"
)

// ParallelImportConfig holds configuration for parallel imports
type ParallelImportConfig struct {
	OrgID         string
	IntegrationID string
	Source        string // "github", "gitlab", "azure-repos", "bitbucket-cloud", etc.
	Concurrency   int
	SnykToken     string
	PollTimeout   time.Duration
	DryRun        bool
}

// ImportResults holds thread-safe import results
type ImportResults struct {
	mu          sync.Mutex
	Imported    []string
	Failed      []string
	Skipped     []string
	ImportedSet map[string]bool
}

// NewImportResults creates a new ImportResults instance
func NewImportResults() *ImportResults {
	return &ImportResults{
		Imported:    make([]string, 0),
		Failed:      make([]string, 0),
		Skipped:     make([]string, 0),
		ImportedSet: make(map[string]bool),
	}
}

// AddImported adds a successfully imported target (thread-safe)
func (r *ImportResults) AddImported(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Imported = append(r.Imported, name)
	r.ImportedSet[name] = true
}

// AddFailed adds a failed target (thread-safe)
func (r *ImportResults) AddFailed(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Failed = append(r.Failed, name)
}

// AddSkipped adds a skipped target (thread-safe)
func (r *ImportResults) AddSkipped(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Skipped = append(r.Skipped, name)
}

// IsImported checks if a target was already imported (thread-safe)
func (r *ImportResults) IsImported(name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.ImportedSet[name]
}

// GetCounts returns the current counts (thread-safe)
func (r *ImportResults) GetCounts() (imported, failed, skipped int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.Imported), len(r.Failed), len(r.Skipped)
}

// ParallelImport imports targets in buckets of config.Concurrency (default 15,
// max 50). Each bucket is imported in parallel and fully completed (imports
// kicked off and polled) before the next bucket starts.
func ParallelImport(ctx context.Context, targets []ImportTarget, config ParallelImportConfig) (*ImportResults, error) {
	if config.Concurrency <= 0 {
		config.Concurrency = GetImportConcurrency(0) // Use default
	}

	if config.PollTimeout == 0 {
		config.PollTimeout = GetPollTimeout()
	}

	results := NewImportResults()
	client := security.NewClient()

	// Drop duplicates up front so batch sizes reflect real work. Targets may
	// span several orgs/integrations (each carries its own), so the same repo
	// destined for two different orgs is not a duplicate.
	type namedTarget struct {
		target ImportTarget
		name   string
	}
	unique := make([]namedTarget, 0, len(targets))
	seen := make(map[string]bool)
	for _, t := range targets {
		fullName := getTargetDisplayName(t, config.Source)
		dedupeKey := strings.TrimSpace(t.OrgID) + "|" + strings.TrimSpace(t.IntegrationID) + "|" + fullName
		if seen[dedupeKey] {
			results.AddSkipped(fullName)
			Logger.Debugf("Skipping duplicate: %s", fullName)
			continue
		}
		seen[dedupeKey] = true
		unique = append(unique, namedTarget{target: t, name: fullName})
	}

	Logger.Infof("Starting batched import: %d targets, batch size=%d", len(unique), config.Concurrency)

	// Rate limiting by buckets: kick off up to Concurrency imports, wait for
	// every one of them (including their polling) to finish, then start the
	// next bucket. This keeps the number of in-flight imports on the Snyk
	// side bounded rather than just bounding request kick-off.
	consecutiveFailedBatches := 0
	for start := 0; start < len(unique); start += config.Concurrency {
		if err := ctx.Err(); err != nil {
			return results, err
		}
		end := start + config.Concurrency
		if end > len(unique) {
			end = len(unique)
		}
		batch := unique[start:end]
		Logger.Infof("Importing batch %d-%d out of %d", start+1, end, len(unique))

		var wg sync.WaitGroup
		var batchFailed int32
		for _, nt := range batch {
			wg.Add(1)
			go func(target ImportTarget, targetName string) {
				defer wg.Done()

				// wg is also used for this target's async poll, so the batch
				// only completes once polling has finished.
				err := performSingleImport(ctx, client, target, config, &wg)
				if err != nil {
					atomic.AddInt32(&batchFailed, 1)
					results.AddFailed(targetName)
					Logger.Errorf("Import failed for %s: %v", targetName, err)
				} else {
					results.AddImported(targetName)
					Logger.Infof("Import started for %s", targetName)
				}
			}(nt.target, nt.name)
		}
		wg.Wait() // Wait for this batch's imports AND polls before the next

		// If every import in consecutive batches failed, something is wrong
		// with the configuration (token, integration, org...). Stop instead of
		// hammering the API with the remaining targets.
		if int(atomic.LoadInt32(&batchFailed)) == len(batch) {
			consecutiveFailedBatches++
			if consecutiveFailedBatches >= maxConsecutiveFailedBatches {
				return results, fmt.Errorf("every import in the last %d batches failed, stopping as this is unexpected; check your configuration and logs, then re-run (%d of %d targets not attempted)",
					consecutiveFailedBatches, len(unique)-end, len(unique))
			}
		} else {
			consecutiveFailedBatches = 0
		}
	}

	imported, failed, skipped := results.GetCounts()
	Logger.Infof("Import complete: %d imported, %d failed, %d skipped", imported, failed, skipped)

	return results, nil
}

// performSingleImport handles a single import request with centralized rate limiting and retry logic
func performSingleImport(ctx context.Context, client *security.Client, target ImportTarget, config ParallelImportConfig, wg *sync.WaitGroup) error {
	fullName := getTargetDisplayName(target, config.Source)

	// Trim whitespace from IDs
	orgID := strings.TrimSpace(target.OrgID)
	integrationID := strings.TrimSpace(target.IntegrationID)

	importBody := buildImportRequestBody(target, config.Source)

	bodyBytes, err := json.Marshal(importBody)
	if err != nil {
		return fmt.Errorf("marshal body: %w", err)
	}

	// Build API URL
	base := GetSnykAPIBaseURL()

	// Validate IDs to prevent path traversal
	if strings.ContainsAny(orgID, ":/\\") || strings.ContainsAny(integrationID, ":/\\") {
		return fmt.Errorf("invalid orgID or integrationID for repo '%s'", fullName)
	}

	apiPath := path.Join("v1", "org", orgID, "integrations", integrationID, "import")
	apiURL := fmt.Sprintf("%s/%s", base, apiPath)

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", config.SnykToken)
	req.Header.Set("Content-Type", "application/json")

	// Use centralized rate limiting and retry logic
	// Use a shorter retry config for imports (3 retries instead of 5)
	retryCfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 1 * time.Second,
		MaxBackoff:     8 * time.Second,
		BackoffFactor:  2.0,
	}
	resp, body, err := DoWithRetryConfig(ctx, client, req, retryCfg)
	if err != nil {
		// Log structured error
		if os.Getenv("SNYK_LOG_PATH") != "" {
			perOrg := fmt.Sprintf("%s/%s.failed-imports.log", os.Getenv("SNYK_LOG_PATH"), orgID)
			_ = utils.AppendBunyanJSONLine(perOrg, 50, "Failed to import target", map[string]interface{}{
				"integrationID": integrationID,
				"locationURL":   nil,
				"target":        target.Target,
				"errorData": map[string]string{
					"errorMessage": err.Error(),
				},
			})
		}
		return fmt.Errorf("import request: %w", err)
	}

	// Handle success (201)
	if resp.StatusCode == 201 {
		location := resp.Header.Get("Location")

		// Log success
		logFile := fmt.Sprintf("%s/import-log-%d.txt", os.Getenv("SNYK_LOG_PATH"), time.Now().Unix())
		if f, err := security.SafeOpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600); err == nil {
			_ = WriteToLogFile(f, "info", "Import started for repo '%s'. Polling URL: %s\n", fullName, location)
			f.Close()
		}

		// Write structured logs
		if os.Getenv("SNYK_LOG_PATH") != "" {
			perOrgJobs := fmt.Sprintf("%s/%s.import-jobs.log", os.Getenv("SNYK_LOG_PATH"), orgID)
			_ = utils.AppendBunyanJSONLine(perOrgJobs, 30, "Kicked off import", map[string]interface{}{
				"integrationID": integrationID,
				"target":        target.Target,
				"pollingUrl":    location,
			})
		}

		// Start polling (async)
		pollURL := location
		if strings.HasPrefix(location, "/") {
			pollURL = base + location
		}

		// Check if we should poll synchronously (for tests)
		pollSync := os.Getenv("SNYK_POLL_SYNC") == "1"
		skipPoll := os.Getenv("SNYK_SKIP_POLL") == "1"

		if !skipPoll {
			if pollSync {
				// Synchronous polling (for tests)
				_ = pollImportJob(ctx, client, pollURL, orgID, integrationID, target.Target, os.Getenv("SNYK_LOG_PATH"), config.SnykToken, config.PollTimeout)
			} else {
				// Asynchronous polling (production)
				wg.Add(1)
				go func() {
					defer wg.Done()
					_ = pollImportJob(ctx, client, pollURL, orgID, integrationID, target.Target, os.Getenv("SNYK_LOG_PATH"), config.SnykToken, config.PollTimeout)
				}()
			}
		}

		return nil
	}

	// Handle non-201 responses (4xx errors that aren't retried)
	// Capture diagnostic headers
	snykRequestID := resp.Header.Get("snyk-request-id")
	xRequestID := resp.Header.Get("x-request-id")
	reqID := resp.Header.Get("request-id")
	headerInfo := map[string]string{
		"snyk-request-id": snykRequestID,
		"x-request-id":    xRequestID,
		"request-id":      reqID,
	}

	// Write structured error logs
	if os.Getenv("SNYK_LOG_PATH") != "" {
		perOrg := fmt.Sprintf("%s/%s.failed-imports.log", os.Getenv("SNYK_LOG_PATH"), orgID)
		_ = utils.AppendBunyanJSONLine(perOrg, 50, "Failed to import target", map[string]interface{}{
			"integrationID": integrationID,
			"locationURL":   nil,
			"target":        target.Target,
			"errorData": map[string]string{
				"errorMessage": fmt.Sprintf("status %d, body: %s", resp.StatusCode, string(body)),
			},
			"headers": headerInfo,
		})
	}

	return fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
}

// buildImportRequestBody constructs the Snyk import API POST body (target + optional files/exclusionGlobs).
// Bulk import does not merge default exclusions; nil ExclusionGlobs omits the key (Snyk API defaults).
func buildImportRequestBody(target ImportTarget, scmType string) map[string]interface{} {
	body := map[string]interface{}{
		"target": buildImportPayload(target, scmType),
	}
	if len(target.Files) > 0 {
		body["files"] = target.Files
	}
	if target.ExclusionGlobs != nil {
		body["exclusionGlobs"] = *target.ExclusionGlobs
	}
	return body
}

// buildImportPayload constructs the target object inside the import payload based on SCM type.
func buildImportPayload(target ImportTarget, scmType string) map[string]interface{} {
	targetMap := make(map[string]interface{})

	switch scmType {
	case "gitlab":
		// GitLab: send only id and branch
		targetMap["id"] = target.Target.ID
		targetMap["branch"] = target.Target.Branch

	case "bitbucket-server":
		// Bitbucket Server: send projectKey, repoSlug, branch
		targetMap["projectKey"] = target.Target.ProjectKey
		targetMap["repoSlug"] = target.Target.RepoSlug
		targetMap["branch"] = target.Target.Branch

	case "azure-repos":
		// Azure: send name, owner (org), branch
		targetMap["name"] = target.Target.Name
		targetMap["owner"] = target.Target.Owner
		targetMap["branch"] = target.Target.Branch

	default:
		// GitHub, Bitbucket Cloud: send name, owner, branch
		targetMap["name"] = target.Target.Name
		targetMap["owner"] = target.Target.Owner
		targetMap["branch"] = target.Target.Branch
	}

	return targetMap
}

// getTargetDisplayName returns a human-readable name for the target
func getTargetDisplayName(target ImportTarget, scmType string) string {
	var base string

	// For GitLab, use full_name if available
	if target.Target.FullName != "" {
		base = target.Target.FullName
	} else if scmType == "bitbucket-server" && target.Target.ProjectKey != "" && target.Target.RepoSlug != "" {
		base = target.Target.ProjectKey + "/" + target.Target.RepoSlug
	} else if scmType == "azure-repos" && target.Target.Owner != "" {
		base = target.Target.Owner + "/" + target.Target.Name
	} else {
		base = target.Target.Owner + "/" + target.Target.Name
	}

	// Sync per-manifest imports: dedupe by manifest path, not repo alone
	if len(target.Files) > 0 && target.Files[0].Path != "" {
		return base + "@" + target.Files[0].Path
	}
	return base
}

// GetImportConcurrency returns the concurrency setting with precedence:
// 1. CLI flag (if provided, cliFlag > 0)
// 2. Environment variable SNYK_IMPORT_CONCURRENCY
// 3. config.toml [import] concurrency
// 4. config.toml [sync] concurrent_imports (backward compat)
// 5. Default (15)
// The result is capped at maxImportConcurrency.
func GetImportConcurrency(cliFlag int) int {
	n := importConcurrencyUncapped(cliFlag)
	if n > maxImportConcurrency {
		return maxImportConcurrency
	}
	return n
}

const (
	// maxConsecutiveFailedBatches is how many batches in a row may fail
	// completely before ParallelImport gives up.
	maxConsecutiveFailedBatches = 2

	defaultImportConcurrency = 15
	maxImportConcurrency     = 50
)

func importConcurrencyUncapped(cliFlag int) int {
	// 1. CLI flag takes highest priority
	if cliFlag > 0 {
		return cliFlag
	}

	// 2. Environment variable (check both IMPORT_CONCURRENCY and SNYK_IMPORT_CONCURRENCY)
	if c := os.Getenv("IMPORT_CONCURRENCY"); c != "" {
		if parsed, err := strconv.Atoi(c); err == nil && parsed > 0 {
			return parsed
		}
	}
	if c := os.Getenv("SNYK_IMPORT_CONCURRENCY"); c != "" {
		if parsed, err := strconv.Atoi(c); err == nil && parsed > 0 {
			return parsed
		}
	}

	// 3. config.toml [import] section
	if cfg := GetGlobalTOMLConfig(); cfg != nil {
		if cfg.Import.Concurrency > 0 {
			return cfg.Import.Concurrency
		}

		// 4. Fallback to [sync] section for backward compatibility
		if cfg.Sync.ConcurrentImports > 0 {
			return cfg.Sync.ConcurrentImports
		}
	}

	// 5. Default
	return defaultImportConcurrency
}

// GetPollTimeout returns the poll timeout with precedence:
// 1. Environment variable SNYK_POLL_TIMEOUT
// 2. config.toml [import] poll_timeout_minutes
// 3. Default (5 minutes)
func GetPollTimeout() time.Duration {
	// 1. Environment variable
	if v := os.Getenv("SNYK_POLL_TIMEOUT"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}

	// 2. config.toml
	if cfg := GetGlobalTOMLConfig(); cfg != nil {
		if cfg.Import.PollTimeoutMinutes > 0 {
			return time.Duration(cfg.Import.PollTimeoutMinutes) * time.Minute
		}
	}

	// 3. Default
	return 5 * time.Minute
}
