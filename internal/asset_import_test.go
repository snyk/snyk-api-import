package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/snyk/snyk-api-import/internal/network"
	"github.com/snyk/snyk-api-import/internal/security"
)

func TestIsGitHubProvider(t *testing.T) {
	tests := []struct {
		name string
		a    RepositoryAsset
		want bool
	}{
		{"sources says github", RepositoryAsset{Sources: []string{"github"}, RepositoryURL: "https://github.com/o/r"}, true},
		{"sources says gitlab", RepositoryAsset{Sources: []string{"gitlab"}, RepositoryURL: "https://gitlab.com/o/r"}, false},
		{"no sources, github url", RepositoryAsset{RepositoryURL: "https://github.com/o/r"}, true},
		{"no sources, non-github url", RepositoryAsset{RepositoryURL: "https://gitlab.com/o/r"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isGitHubProvider(tt.a); got != tt.want {
				t.Errorf("isGitHubProvider(%#v) = %v; want %v", tt.a, got, tt.want)
			}
		})
	}
}

func TestResolveGitHubIntegration(t *testing.T) {
	tests := []struct {
		name            string
		integrations    map[string]string
		integrationType string
		wantID          string
		wantErr         string
	}{
		{
			name:         "single github-enterprise match",
			integrations: map[string]string{"github-enterprise": "int-1"},
			wantID:       "int-1",
		},
		{
			name:         "no github integration",
			integrations: map[string]string{"gitlab": "int-1"},
			wantErr:      SkipNoIntegration,
		},
		{
			name:         "ambiguous: both github and github-enterprise",
			integrations: map[string]string{"github": "int-1", "github-enterprise": "int-2"},
			wantErr:      SkipAmbiguousIntegration,
		},
		{
			name:            "--integration-type disambiguates",
			integrations:    map[string]string{"github": "int-1", "github-enterprise": "int-2"},
			integrationType: "github-enterprise",
			wantID:          "int-2",
		},
		{
			name:            "--integration-type not configured",
			integrations:    map[string]string{"github": "int-1"},
			integrationType: "github-enterprise",
			wantErr:         SkipNoIntegration,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, err := resolveGitHubIntegration(tt.integrations, tt.integrationType)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("expected error containing %q, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if id != tt.wantID {
				t.Fatalf("got id %q, want %q", id, tt.wantID)
			}
		})
	}
}

// mockAssetImportServer wires up every Snyk endpoint RunAssetImport touches
// behind a single httptest server, so it can run end to end against a
// scripted set of assets/orgs/integrations without hitting the real API.
type mockAssetImportServer struct {
	t                *testing.T
	assetsSearchBody string
	existingOrgsJSON string
	createdOrgID     string
	integrationsJSON string
	forbidWrites     bool
	sawCreateOrg     bool
	sawImport        bool
	sawTagPatch      bool
}

func (m *mockAssetImportServer) handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch {
	case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/assets/search"):
		_, _ = w.Write([]byte(m.assetsSearchBody))

	case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/v1/group/") && strings.HasSuffix(r.URL.Path, "/orgs"):
		_, _ = w.Write([]byte(m.existingOrgsJSON))

	case r.Method == http.MethodPost && r.URL.Path == "/v1/org":
		m.sawCreateOrg = true
		if m.forbidWrites {
			m.t.Fatalf("dry-run must not create orgs, but got POST %s", r.URL.Path)
		}
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"id":%q,"name":%q}`, m.createdOrgID, body["name"])))

	case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/integrations") && strings.Contains(r.URL.Path, "/v1/org/"):
		_, _ = w.Write([]byte(m.integrationsJSON))

	case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/import"):
		m.sawImport = true
		if m.forbidWrites {
			m.t.Fatalf("dry-run must not import, but got POST %s", r.URL.Path)
		}
		w.Header().Set("Location", "/v1/org/x/integrations/y/import/job-1")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))

	case r.Method == http.MethodPatch && strings.Contains(r.URL.Path, "/assets/"):
		m.sawTagPatch = true
		if m.forbidWrites {
			m.t.Fatalf("dry-run must not write tags, but got PATCH %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"data":{}}`))

	default:
		m.t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
	}
}

func setupAssetImportEnv(t *testing.T, srvURL string) {
	t.Helper()
	restoreNet := network.SetTestClient(func() network.Client { return &testClient{c: http.DefaultClient} })
	restoreSec := security.SetTestHTTPClient(http.DefaultClient, nil)
	os.Setenv("SNYK_API", srvURL)
	os.Setenv("SNYK_TOKEN", "test-token")
	os.Setenv("SNYK_SKIP_POLL", "1")
	os.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")
	t.Cleanup(func() {
		restoreNet()
		restoreSec()
		os.Unsetenv("SNYK_API")
		os.Unsetenv("SNYK_TOKEN")
		os.Unsetenv("SNYK_SKIP_POLL")
		os.Unsetenv("SNYK_TEST_SKIP_URL_VALIDATION")
	})
}

const testGroupID = "deadbeef-0000-0000-0000-000000000001"

func assetsFixture() string {
	return `{"data":[
		{"id":"asset-new","type":"repository","attributes":{"sources":["github"],"name":"checkout-svc","repository_url":"https://github.com/acme/checkout-svc","default_branch_name":"main","tags":{"__snyk_destination_org__":"checkout"}}},
		{"id":"asset-already-imported","type":"repository","attributes":{"sources":["github"],"name":"checkout-worker","repository_url":"https://github.com/acme/checkout-worker","default_branch_name":"main","tags":{"__snyk_destination_org__":"checkout","__snyk_auto_imported__":"checkout"}}},
		{"id":"asset-excluded","type":"repository","attributes":{"sources":["github"],"name":"internal-tools","repository_url":"https://github.com/acme/internal-tools","default_branch_name":"main","tags":{"__snyk_destination_org__":"__exclude__"}}},
		{"id":"asset-untagged","type":"repository","attributes":{"sources":["github"],"name":"mystery-repo","repository_url":"https://github.com/acme/mystery-repo","default_branch_name":"main"}},
		{"id":"asset-gitlab","type":"repository","attributes":{"sources":["gitlab"],"name":"payments-svc","repository_url":"https://gitlab.com/acme/payments-svc","default_branch_name":"main","tags":{"__snyk_destination_org__":"payments"}}},
		{"id":"asset-moved","type":"repository","attributes":{"sources":["github"],"name":"moved-repo","repository_url":"https://github.com/acme/moved-repo","default_branch_name":"main","tags":{"__snyk_destination_org__":"checkout","__snyk_auto_imported__":"old-org"}}}
	],"links":{}}`
}

func TestRunAssetImport_EndToEnd(t *testing.T) {
	m := &mockAssetImportServer{
		t:                t,
		assetsSearchBody: assetsFixture(),
		existingOrgsJSON: `{"id":"g","name":"g","orgs":[]}`,
		createdOrgID:     "org-checkout",
		integrationsJSON: `{"github-enterprise":"integration-1"}`,
	}
	srv := httptest.NewServer(http.HandlerFunc(m.handler))
	defer srv.Close()
	setupAssetImportEnv(t, srv.URL)

	report, err := RunAssetImport(context.Background(), AssetImportOptions{GroupID: testGroupID})
	if err != nil {
		t.Fatalf("RunAssetImport returned error: %v", err)
	}

	if len(report.ImportErrors) != 0 {
		t.Fatalf("unexpected import errors: %v", report.ImportErrors)
	}
	if len(report.OrgsCreated) != 1 || report.OrgsCreated[0] != "checkout" {
		t.Fatalf("expected org 'checkout' to be created, got %v", report.OrgsCreated)
	}
	if len(report.Imported) != 1 || !strings.Contains(report.Imported[0], "acme/checkout-svc") {
		t.Fatalf("expected checkout-svc to be imported, got %v", report.Imported)
	}
	if !m.sawTagPatch {
		t.Fatal("expected the newly imported asset to be tagged auto-imported")
	}

	wantSkips := map[string]int{
		SkipAlreadyImported:     1,
		SkipExcluded:            1,
		SkipNoTag:               1,
		SkipUnsupportedProvider: 1,
		SkipOrgMoved:            1,
	}
	for reason, count := range wantSkips {
		if got := len(report.Skipped[reason]); got != count {
			t.Errorf("skip reason %q: got %d, want %d (all skips: %#v)", reason, got, count, report.Skipped)
		}
	}
}

func TestRunAssetImport_DryRunMakesNoWrites(t *testing.T) {
	fixture := `{"data":[
		{"id":"asset-new","type":"repository","attributes":{"sources":["github"],"name":"checkout-svc","repository_url":"https://github.com/acme/checkout-svc","default_branch_name":"main","tags":{"__snyk_destination_org__":"checkout"}}}
	],"links":{}}`
	m := &mockAssetImportServer{
		t:                t,
		assetsSearchBody: fixture,
		existingOrgsJSON: `{"id":"g","name":"g","orgs":[]}`,
		forbidWrites:     true,
	}
	srv := httptest.NewServer(http.HandlerFunc(m.handler))
	defer srv.Close()
	setupAssetImportEnv(t, srv.URL)

	report, err := RunAssetImport(context.Background(), AssetImportOptions{GroupID: testGroupID, DryRun: true})
	if err != nil {
		t.Fatalf("RunAssetImport returned error: %v", err)
	}
	if !report.DryRun {
		t.Fatal("expected report.DryRun to be true")
	}
	if m.sawCreateOrg || m.sawImport || m.sawTagPatch {
		t.Fatalf("dry-run performed a write: createOrg=%v import=%v tagPatch=%v", m.sawCreateOrg, m.sawImport, m.sawTagPatch)
	}
	if len(report.OrgsCreated) != 1 || !strings.Contains(report.OrgsCreated[0], "would create") {
		t.Fatalf("expected a 'would create' entry, got %v", report.OrgsCreated)
	}
	if len(report.Imported) != 1 || !strings.Contains(report.Imported[0], "would import") {
		t.Fatalf("expected a 'would import' entry, got %v", report.Imported)
	}
}

func TestRunAssetImport_RequiresGroupID(t *testing.T) {
	if _, err := RunAssetImport(context.Background(), AssetImportOptions{}); err == nil {
		t.Fatal("expected error for missing GroupID")
	}
}

func TestRunAssetImport_RejectsInvalidTagKey(t *testing.T) {
	_, err := RunAssetImport(context.Background(), AssetImportOptions{GroupID: testGroupID, TagKey: "has a space"})
	if err == nil || !strings.Contains(err.Error(), "invalid --tag-key") {
		t.Fatalf("expected invalid tag key error, got %v", err)
	}
}
