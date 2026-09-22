package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/snyk/snyk-api-import/internal/network"
)

func TestParseGitHubOwnerRepo(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		wantOwner string
		wantRepo  string
		wantOK    bool
	}{
		{"simple", "https://github.com/snyk-labs/snyk-filter", "snyk-labs", "snyk-filter", true},
		{"trailing git suffix", "https://github.com/snyk-labs/snyk-filter.git", "snyk-labs", "snyk-filter", true},
		{"trailing slash", "https://github.com/snyk-labs/snyk-filter/", "snyk-labs", "snyk-filter", true},
		{"gitlab is out of scope", "https://gitlab.com/group/project", "", "", false},
		{"missing repo", "https://github.com/snyk-labs", "", "", false},
		{"empty", "", "", "", false},
		{"not a url", "not a url", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			owner, repo, ok := ParseGitHubOwnerRepo(tt.url)
			if ok != tt.wantOK || owner != tt.wantOwner || repo != tt.wantRepo {
				t.Errorf("ParseGitHubOwnerRepo(%q) = (%q, %q, %v); want (%q, %q, %v)",
					tt.url, owner, repo, ok, tt.wantOwner, tt.wantRepo, tt.wantOK)
			}
		})
	}
}

func TestSearchRepositoryAssets_Pagination(t *testing.T) {
	page1 := `{"data":[{"id":"a1","type":"repository","attributes":{"sources":["github"],"name":"repo1","repository_url":"https://github.com/o/repo1","default_branch_name":"main"}}],"links":{"next":"/rest/groups/g1/assets/search?limit=100&starting_after=CURSOR1&version=` + AssetsAPIVersion + `"}}`
	page2 := `{"data":[{"id":"a2","type":"repository","attributes":{"sources":["github"],"name":"repo2","repository_url":"https://github.com/o/repo2","default_branch_name":"main","tags":{"__snyk_destination_org__":"checkout"}}}],"links":{}}`

	requestCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if !strings.Contains(r.URL.Path, "/rest/groups/g1/assets/search") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "starting_after") {
			_, _ = w.Write([]byte(page2))
			return
		}
		_, _ = w.Write([]byte(page1))
	}))
	defer srv.Close()

	restoreNet := network.SetTestClient(func() network.Client { return &testClient{c: srv.Client()} })
	defer restoreNet()
	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "tok")
	defer os.Unsetenv("SNYK_TOKEN")

	assets, err := SearchRepositoryAssets(context.Background(), "g1")
	if err != nil {
		t.Fatalf("SearchRepositoryAssets returned error: %v", err)
	}
	if requestCount != 2 {
		t.Fatalf("expected 2 requests (paginated), got %d", requestCount)
	}
	if len(assets) != 2 {
		t.Fatalf("expected 2 assets across both pages, got %d", len(assets))
	}
	if assets[1].Tags["__snyk_destination_org__"] != "checkout" {
		t.Fatalf("expected second asset's tag to be preserved, got %#v", assets[1].Tags)
	}
}

func TestUpdateAssetTags_Success(t *testing.T) {
	var gotBody map[string]interface{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			t.Fatalf("expected PATCH, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/vnd.api+json" {
			t.Fatalf("unexpected content-type: %s", ct)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	defer srv.Close()

	restoreNet := network.SetTestClient(func() network.Client { return &testClient{c: srv.Client()} })
	defer restoreNet()
	os.Setenv("SNYK_API", srv.URL)
	defer os.Unsetenv("SNYK_API")
	os.Setenv("SNYK_TOKEN", "tok")
	defer os.Unsetenv("SNYK_TOKEN")

	err := UpdateAssetTags(context.Background(), "g1", "asset1", map[string]string{AutoImportedTagKey: "checkout"})
	if err != nil {
		t.Fatalf("UpdateAssetTags returned error: %v", err)
	}

	data, _ := gotBody["data"].(map[string]interface{})
	attrs, _ := data["attributes"].(map[string]interface{})
	tags, _ := attrs["tags"].(map[string]interface{})
	add, _ := tags["add"].(map[string]interface{})
	if add[AutoImportedTagKey] != "checkout" {
		t.Fatalf("unexpected request body: %#v", gotBody)
	}
}

func TestUpdateAssetTags_NoChanges(t *testing.T) {
	if err := UpdateAssetTags(context.Background(), "g1", "a1", nil); err == nil {
		t.Fatal("expected error for empty tag changes")
	}
}
