package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sam1el/snyk-api-import-go/internal/security"
)

// TestPollImportJob_LifecyclePendingToCompleted verifies that pollImportJob
// records intermediate statuses and writes the final project entry when the
// job transitions from pending to completed.
func TestPollImportJob_LifecyclePendingToCompleted(t *testing.T) {
	// Prepare temporary log directory
	logDir := t.TempDir()
	if err := os.Setenv("SNYK_LOG_PATH", logDir); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	// Allow httptest server URLs to bypass host validation in security.Client
	if err := os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")

	// Set fast poll interval for testing (100ms instead of 20 seconds)
	if err := os.Setenv("SNYK_POLL_INTERVAL_MS", "100"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_POLL_INTERVAL_MS")

	// Create an httptest server that returns pending then completed
	// Response format matches Snyk API: logs array contains projects
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		if calls == 1 {
			_, _ = w.Write([]byte(`{"status":"pending"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"completed","logs":[{"projects":[{"id":"proj-1","name":"MyProject"}]}]}`))
	}))
	defer srv.Close()

	// Inject the httptest client's http.Client into the security client factory
	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()

	client := security.NewClient()

	target := Target{
		Name:   "repo",
		Owner:  "owner",
		Branch: "main",
	}

	// Run the poller (short timeout should be sufficient since server responds
	// deterministically)
	if err := pollImportJob(context.Background(), client, srv.URL, "org123", "int-1", target, logDir, "", 5*time.Second); err != nil {
		t.Fatalf("pollImportJob returned error: %v", err)
	}

	// Read and verify import-job-results.log contains both pending and completed
	resultsPath := filepath.Join(logDir, "org123.import-job-results.log")
	data, err := os.ReadFile(resultsPath)
	if err != nil {
		t.Fatalf("read results log: %v", err)
	}
	lines := strings.Split(string(data), "\n")
	var sawPending, sawCompleted bool
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		var m map[string]interface{}
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("unmarshal results line: %v -- line: %s", err, l)
		}
		// status may be top-level (payload merged) or inside raw
		if s, ok := m["status"].(string); ok {
			if s == "pending" {
				sawPending = true
			}
			if s == "completed" {
				sawCompleted = true
			}
		}
		if raw, ok := m["raw"].(map[string]interface{}); ok {
			if rs, ok2 := raw["status"].(string); ok2 {
				if rs == "pending" {
					sawPending = true
				}
				if rs == "completed" {
					sawCompleted = true
				}
			}
		}
	}
	if !sawPending || !sawCompleted {
		t.Fatalf("expected both pending and completed statuses in %s; sawPending=%v sawCompleted=%v contents=%s", resultsPath, sawPending, sawCompleted, string(data))
	}

	// Read and verify imported-projects.log contains the project object
	projPath := filepath.Join(logDir, "org123.imported-projects.log")
	pdata, err := os.ReadFile(projPath)
	if err != nil {
		t.Fatalf("read imported projects log: %v", err)
	}
	plines := strings.Split(string(pdata), "\n")
	var foundProj bool
	for _, l := range plines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		var m map[string]interface{}
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("unmarshal project line: %v -- line: %s", err, l)
		}
		if proj, ok := m["project"].(map[string]interface{}); ok {
			if id, ok2 := proj["id"].(string); ok2 && id == "proj-1" {
				foundProj = true
				break
			}
		}
	}
	if !foundProj {
		t.Fatalf("expected project with id 'proj-1' in %s; contents=%s", projPath, string(pdata))
	}
}

func TestPollImportJob_FailedStatus(t *testing.T) {
	logDir := t.TempDir()
	if err := os.Setenv("SNYK_LOG_PATH", logDir); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_LOG_PATH")
	if err := os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	if err := os.Setenv("SNYK_POLL_INTERVAL_MS", "100"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_POLL_INTERVAL_MS")

	// Server immediately returns failed
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"failed","error":"broken"}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	client := security.NewClient()

	target := Target{Name: "repo", Owner: "owner", Branch: "main"}

	err := pollImportJob(context.Background(), client, srv.URL, "org123", "int-1", target, logDir, "", 3*time.Second)
	if err == nil {
		t.Fatalf("expected error from pollImportJob for failed status, got nil")
	}

	// failed-projects.log should exist and contain the error message
	failedPath := filepath.Join(logDir, "org123.failed-projects.log")
	data, rerr := os.ReadFile(failedPath)
	if rerr != nil {
		t.Fatalf("read failed-projects log: %v", rerr)
	}
	if !strings.Contains(string(data), "broken") {
		t.Fatalf("expected failed-projects.log to contain 'broken'; contents=%s", string(data))
	}
}

func TestPollImportJob_MultiStepLifecycle(t *testing.T) {
	logDir := t.TempDir()
	if err := os.Setenv("SNYK_LOG_PATH", logDir); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_LOG_PATH")
	if err := os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	if err := os.Setenv("SNYK_POLL_INTERVAL_MS", "100"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer os.Unsetenv("SNYK_POLL_INTERVAL_MS")

	// Server returns multiple intermediate statuses before completing
	// Response format matches Snyk API: logs array contains projects
	steps := []string{"pending", "pending", "in_progress", "completed"}
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		s := steps[calls%len(steps)]
		calls++
		if s == "completed" {
			_, _ = w.Write([]byte(`{"status":"completed","logs":[{"projects":[{"id":"multi-proj","name":"Multi"}]}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"` + s + `"}`))
	}))
	defer srv.Close()

	restore := security.SetTestHTTPClient(srv.Client(), nil)
	defer restore()
	client := security.NewClient()

	target := Target{Name: "repo", Owner: "owner", Branch: "main"}

	if err := pollImportJob(context.Background(), client, srv.URL, "org123", "int-1", target, logDir, "", 5*time.Second); err != nil {
		t.Fatalf("pollImportJob returned error: %v", err)
	}

	// Read import-job-results.log and count entries (should be at least len(steps)-?)
	resultsPath := filepath.Join(logDir, "org123.import-job-results.log")
	data, err := os.ReadFile(resultsPath)
	if err != nil {
		t.Fatalf("read results log: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) < 3 {
		t.Fatalf("expected multiple job-result entries, got %d; contents=%s", len(lines), string(data))
	}

	// Verify imported-projects contains the final project
	projPath := filepath.Join(logDir, "org123.imported-projects.log")
	pdata, err := os.ReadFile(projPath)
	if err != nil {
		t.Fatalf("read imported projects log: %v", err)
	}
	if !strings.Contains(string(pdata), "multi-proj") {
		t.Fatalf("expected imported-projects.log to contain 'multi-proj'; contents=%s", string(pdata))
	}
}
