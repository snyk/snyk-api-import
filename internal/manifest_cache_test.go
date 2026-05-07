package internal

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestManifestCache_NewAndSave(t *testing.T) {
	// Create temp directory for cache
	tmpDir := t.TempDir()
	orgID := "test-org-123"

	// Create new cache
	cache := NewManifestCache(orgID)
	if cache.OrgID != orgID {
		t.Errorf("expected org ID %s, got %s", orgID, cache.OrgID)
	}

	if cache.Version != CacheVersion {
		t.Errorf("expected version %s, got %s", CacheVersion, cache.Version)
	}

	// Save cache
	err := cache.Save(tmpDir)
	if err != nil {
		t.Fatalf("failed to save cache: %v", err)
	}

	// Verify file exists
	cachePath := GetCachePath(tmpDir, orgID)
	if _, err := os.Stat(cachePath); os.IsNotExist(err) {
		t.Errorf("cache file was not created at %s", cachePath)
	}
}

func TestManifestCache_SetAndGet(t *testing.T) {
	cache := NewManifestCache("test-org")

	// Set a cache entry
	owner := "testowner"
	repo := "testrepo"
	branch := "main"
	commitSHA := "abc123def456"
	manifests := []string{"package.json", "pom.xml"}

	cache.Set(owner, repo, branch, commitSHA, manifests, "api", 5)

	// Get the entry
	entry, exists := cache.Get(owner, repo, branch)
	if !exists {
		t.Fatal("expected cache entry to exist")
	}

	if entry.Owner != owner {
		t.Errorf("expected owner %s, got %s", owner, entry.Owner)
	}

	if entry.Repo != repo {
		t.Errorf("expected repo %s, got %s", repo, entry.Repo)
	}

	if entry.CommitSHA != commitSHA {
		t.Errorf("expected commit SHA %s, got %s", commitSHA, entry.CommitSHA)
	}

	if len(entry.Manifests) != len(manifests) {
		t.Errorf("expected %d manifests, got %d", len(manifests), len(entry.Manifests))
	}

	if entry.DiscoveryMethod != "api" {
		t.Errorf("expected discovery method 'api', got '%s'", entry.DiscoveryMethod)
	}

	if entry.APICalls != 5 {
		t.Errorf("expected 5 API calls, got %d", entry.APICalls)
	}
}

func TestManifestCache_IsValid(t *testing.T) {
	cache := NewManifestCache("test-org")

	owner := "testowner"
	repo := "testrepo"
	branch := "main"
	commitSHA := "abc123"

	// Set entry
	cache.Set(owner, repo, branch, commitSHA, []string{"package.json"}, "api", 1)

	// Check validity with same SHA
	if !cache.IsValid(owner, repo, branch, commitSHA) {
		t.Error("expected cache to be valid for same commit SHA")
	}

	// Check validity with different SHA
	if cache.IsValid(owner, repo, branch, "different-sha") {
		t.Error("expected cache to be invalid for different commit SHA")
	}

	// Check validity for non-existent entry
	if cache.IsValid("other", "repo", "main", "sha") {
		t.Error("expected cache to be invalid for non-existent entry")
	}
}

func TestManifestCache_LoadAndSave(t *testing.T) {
	tmpDir := t.TempDir()
	orgID := "test-org-456"

	// Create and populate cache
	cache1 := NewManifestCache(orgID)
	cache1.Set("owner1", "repo1", "main", "sha1", []string{"package.json"}, "api", 3)
	cache1.Set("owner2", "repo2", "develop", "sha2", []string{"pom.xml", "build.gradle"}, "clone", 0)

	// Save cache
	err := cache1.Save(tmpDir)
	if err != nil {
		t.Fatalf("failed to save cache: %v", err)
	}

	// Load cache
	cache2, err := LoadManifestCache(tmpDir, orgID)
	if err != nil {
		t.Fatalf("failed to load cache: %v", err)
	}

	// Verify loaded cache matches original
	if cache2.OrgID != orgID {
		t.Errorf("expected org ID %s, got %s", orgID, cache2.OrgID)
	}

	if len(cache2.Repos) != 2 {
		t.Errorf("expected 2 repos in cache, got %d", len(cache2.Repos))
	}

	// Verify first entry
	entry1, exists := cache2.Get("owner1", "repo1", "main")
	if !exists {
		t.Fatal("expected first entry to exist")
	}
	if entry1.CommitSHA != "sha1" {
		t.Errorf("expected commit SHA 'sha1', got '%s'", entry1.CommitSHA)
	}

	// Verify second entry
	entry2, exists := cache2.Get("owner2", "repo2", "develop")
	if !exists {
		t.Fatal("expected second entry to exist")
	}
	if len(entry2.Manifests) != 2 {
		t.Errorf("expected 2 manifests, got %d", len(entry2.Manifests))
	}
}

func TestManifestCache_Invalidate(t *testing.T) {
	cache := NewManifestCache("test-org")

	owner := "testowner"
	repo := "testrepo"
	branch := "main"

	// Set entry
	cache.Set(owner, repo, branch, "sha1", []string{"package.json"}, "api", 1)

	// Verify it exists
	_, exists := cache.Get(owner, repo, branch)
	if !exists {
		t.Fatal("expected entry to exist before invalidation")
	}

	// Invalidate
	cache.Invalidate(owner, repo, branch)

	// Verify it's gone
	_, exists = cache.Get(owner, repo, branch)
	if exists {
		t.Error("expected entry to not exist after invalidation")
	}
}

func TestManifestCache_Clear(t *testing.T) {
	cache := NewManifestCache("test-org")

	// Add multiple entries
	cache.Set("owner1", "repo1", "main", "sha1", []string{"package.json"}, "api", 1)
	cache.Set("owner2", "repo2", "main", "sha2", []string{"pom.xml"}, "api", 1)
	cache.Set("owner3", "repo3", "main", "sha3", []string{"go.mod"}, "api", 1)

	if len(cache.Repos) != 3 {
		t.Errorf("expected 3 repos before clear, got %d", len(cache.Repos))
	}

	// Clear cache
	cache.Clear()

	if len(cache.Repos) != 0 {
		t.Errorf("expected 0 repos after clear, got %d", len(cache.Repos))
	}
}

func TestManifestCache_Cleanup(t *testing.T) {
	cache := NewManifestCache("test-org")

	// Add entries with different ages
	now := time.Now()

	// Recent entry (should not be removed)
	cache.Set("owner1", "repo1", "main", "sha1", []string{"package.json"}, "api", 1)

	// Old entry (should be removed)
	cache.Set("owner2", "repo2", "main", "sha2", []string{"pom.xml"}, "api", 1)
	key := makeCacheKey("owner2", "repo2", "main")
	entry := cache.Repos[key]
	entry.LastChecked = now.Add(-8 * 24 * time.Hour) // 8 days ago
	cache.Repos[key] = entry

	// Very old entry (should be removed)
	cache.Set("owner3", "repo3", "main", "sha3", []string{"go.mod"}, "api", 1)
	key = makeCacheKey("owner3", "repo3", "main")
	entry = cache.Repos[key]
	entry.LastChecked = now.Add(-30 * 24 * time.Hour) // 30 days ago
	cache.Repos[key] = entry

	// Cleanup entries older than 7 days
	removed := cache.Cleanup(7 * 24 * time.Hour)

	if removed != 2 {
		t.Errorf("expected 2 entries removed, got %d", removed)
	}

	if len(cache.Repos) != 1 {
		t.Errorf("expected 1 entry remaining, got %d", len(cache.Repos))
	}

	// Verify the recent entry still exists
	_, exists := cache.Get("owner1", "repo1", "main")
	if !exists {
		t.Error("expected recent entry to still exist")
	}
}

func TestManifestCache_GetStats(t *testing.T) {
	cache := NewManifestCache("test-org")

	// Add entries
	cache.Set("owner1", "repo1", "main", "sha1", []string{"package.json", "yarn.lock"}, "api", 2)
	cache.Set("owner2", "repo2", "main", "sha2", []string{"pom.xml"}, "api", 1)
	cache.Set("owner3", "repo3", "main", "sha3", []string{}, "api", 1) // No manifests

	stats := cache.GetStats()

	if stats.TotalRepos != 3 {
		t.Errorf("expected 3 total repos, got %d", stats.TotalRepos)
	}

	if stats.TotalManifests != 3 {
		t.Errorf("expected 3 total manifests, got %d", stats.TotalManifests)
	}
}

func TestGetCachePath(t *testing.T) {
	tmpDir := "/tmp/test-cache"
	orgID := "test-org-789"

	path := GetCachePath(tmpDir, orgID)
	expected := filepath.Join(tmpDir, orgID+CacheFileExt)

	if path != expected {
		t.Errorf("expected cache path %s, got %s", expected, path)
	}
}

func TestManifestCache_CheckCount(t *testing.T) {
	cache := NewManifestCache("test-org")

	owner := "testowner"
	repo := "testrepo"
	branch := "main"

	// First set
	cache.Set(owner, repo, branch, "sha1", []string{"package.json"}, "api", 1)
	entry, _ := cache.Get(owner, repo, branch)
	if entry.CheckCount != 1 {
		t.Errorf("expected check count 1, got %d", entry.CheckCount)
	}

	// Second set (update)
	cache.Set(owner, repo, branch, "sha2", []string{"package.json", "yarn.lock"}, "api", 2)
	entry, _ = cache.Get(owner, repo, branch)
	if entry.CheckCount != 2 {
		t.Errorf("expected check count 2, got %d", entry.CheckCount)
	}

	// Third set (another update)
	cache.Set(owner, repo, branch, "sha3", []string{"package.json"}, "clone", 0)
	entry, _ = cache.Get(owner, repo, branch)
	if entry.CheckCount != 3 {
		t.Errorf("expected check count 3, got %d", entry.CheckCount)
	}
}

func TestClearCacheForOrg(t *testing.T) {
	tmpDir := t.TempDir()
	orgID := "test-org-clear"

	// Create and save a cache
	cache := NewManifestCache(orgID)
	cache.Set("owner1", "repo1", "main", "sha1", []string{"package.json"}, "api", 1)
	err := cache.Save(tmpDir)
	if err != nil {
		t.Fatalf("failed to save cache: %v", err)
	}

	// Verify file exists
	cachePath := GetCachePath(tmpDir, orgID)
	if _, err := os.Stat(cachePath); os.IsNotExist(err) {
		t.Fatal("cache file should exist before clearing")
	}

	// Clear cache
	err = ClearCacheForOrg(tmpDir, orgID)
	if err != nil {
		t.Fatalf("failed to clear cache: %v", err)
	}

	// Verify file is gone
	if _, err := os.Stat(cachePath); !os.IsNotExist(err) {
		t.Error("cache file should not exist after clearing")
	}
}

func TestGetCacheSize(t *testing.T) {
	tmpDir := t.TempDir()
	orgID := "test-org-size"

	// Create and save a cache
	cache := NewManifestCache(orgID)
	cache.Set("owner1", "repo1", "main", "sha1", []string{"package.json", "yarn.lock"}, "api", 2)
	cache.Set("owner2", "repo2", "develop", "sha2", []string{"pom.xml"}, "api", 1)
	err := cache.Save(tmpDir)
	if err != nil {
		t.Fatalf("failed to save cache: %v", err)
	}

	// Get cache size
	size, err := GetCacheSize(tmpDir, orgID)
	if err != nil {
		t.Fatalf("failed to get cache size: %v", err)
	}

	if size <= 0 {
		t.Errorf("expected positive cache size, got %d", size)
	}
}

func TestGetCacheSize_NonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	orgID := "non-existent-org"

	// Try to get size of non-existent cache - should return 0, nil (not an error)
	size, err := GetCacheSize(tmpDir, orgID)
	if err != nil {
		t.Errorf("unexpected error for non-existent cache: %v", err)
	}
	if size != 0 {
		t.Errorf("expected size 0 for non-existent cache, got %d", size)
	}
}

func TestCachedRepoEntry_GetAllFiles(t *testing.T) {
	entry := CachedRepoEntry{
		Owner:     "testowner",
		Repo:      "testrepo",
		Branch:    "main",
		Manifests: []string{"package.json", "src/pom.xml", "Dockerfile"},
	}

	files := entry.GetAllFiles()
	if len(files) != 3 {
		t.Errorf("expected 3 files, got %d", len(files))
	}

	// Verify all files are present
	expectedFiles := map[string]bool{
		"package.json": true,
		"src/pom.xml":  true,
		"Dockerfile":   true,
	}
	for _, f := range files {
		if !expectedFiles[f] {
			t.Errorf("unexpected file in results: %s", f)
		}
	}
}

func TestCachedRepoEntry_GetFilesByType(t *testing.T) {
	entry := CachedRepoEntry{
		Owner:          "testowner",
		Repo:           "testrepo",
		Branch:         "main",
		SCAFiles:       []string{"package.json", "yarn.lock", "pom.xml"},
		ContainerFiles: []string{"Dockerfile"},
		IaCFiles:       []string{"main.tf"},
	}

	// Test SCA files
	scaFiles := entry.GetFilesByType("sca")
	if len(scaFiles) != 3 {
		t.Errorf("expected 3 SCA files, got %d: %v", len(scaFiles), scaFiles)
	}

	// Test container files
	containerFiles := entry.GetFilesByType("container")
	if len(containerFiles) != 1 {
		t.Errorf("expected 1 container file, got %d: %v", len(containerFiles), containerFiles)
	}

	// Test IaC files
	iacFiles := entry.GetFilesByType("iac")
	if len(iacFiles) != 1 {
		t.Errorf("expected 1 IaC file, got %d: %v", len(iacFiles), iacFiles)
	}

	// Test all files
	allFiles := entry.GetFilesByType("all")
	if len(allFiles) != 5 {
		t.Errorf("expected 5 files for 'all' type, got %d", len(allFiles))
	}

	// Test unknown type (should return all)
	unknownFiles := entry.GetFilesByType("unknown")
	if len(unknownFiles) != 5 {
		t.Errorf("expected 5 files for unknown type, got %d", len(unknownFiles))
	}
}

func TestCachedRepoEntry_HasFiles(t *testing.T) {
	tests := []struct {
		name           string
		scaFiles       []string
		containerFiles []string
		iacFiles       []string
		fileType       string
		want           bool
	}{
		{
			name:     "has SCA files",
			scaFiles: []string{"package.json", "pom.xml"},
			fileType: "sca",
			want:     true,
		},
		{
			name:           "no SCA files",
			containerFiles: []string{"Dockerfile"},
			iacFiles:       []string{"main.tf"},
			fileType:       "sca",
			want:           false,
		},
		{
			name:           "has container files",
			containerFiles: []string{"Dockerfile"},
			scaFiles:       []string{"package.json"},
			fileType:       "container",
			want:           true,
		},
		{
			name:     "no container files",
			scaFiles: []string{"package.json"},
			iacFiles: []string{"main.tf"},
			fileType: "container",
			want:     false,
		},
		{
			name:     "has IaC files",
			iacFiles: []string{"main.tf"},
			scaFiles: []string{"package.json"},
			fileType: "iac",
			want:     true,
		},
		{
			name:           "no IaC files",
			scaFiles:       []string{"package.json"},
			containerFiles: []string{"Dockerfile"},
			fileType:       "iac",
			want:           false,
		},
		{
			name:     "empty files",
			fileType: "sca",
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry := CachedRepoEntry{
				Owner:          "testowner",
				Repo:           "testrepo",
				Branch:         "main",
				SCAFiles:       tt.scaFiles,
				ContainerFiles: tt.containerFiles,
				IaCFiles:       tt.iacFiles,
			}
			got := entry.HasFiles(tt.fileType)
			if got != tt.want {
				t.Errorf("HasFiles(%q) = %v, want %v", tt.fileType, got, tt.want)
			}
		})
	}
}

func TestManifestCache_SetEntry(t *testing.T) {
	cache := NewManifestCache("test-org")

	// Create an entry
	entry := CachedRepoEntry{
		Owner:           "testowner",
		Repo:            "testrepo",
		Branch:          "main",
		CommitSHA:       "abc123",
		Manifests:       []string{"package.json", "pom.xml"},
		LastChecked:     time.Now(),
		CheckCount:      5,
		DiscoveryMethod: "api",
		APICalls:        3,
	}

	// Set the entry
	cache.SetEntry("testowner", "testrepo", "main", entry)

	// Retrieve and verify
	retrieved, exists := cache.Get("testowner", "testrepo", "main")
	if !exists {
		t.Fatal("expected entry to exist after SetEntry")
	}

	if retrieved.CommitSHA != "abc123" {
		t.Errorf("expected commit SHA 'abc123', got '%s'", retrieved.CommitSHA)
	}

	if retrieved.CheckCount != 5 {
		t.Errorf("expected check count 5, got %d", retrieved.CheckCount)
	}

	if len(retrieved.Manifests) != 2 {
		t.Errorf("expected 2 manifests, got %d", len(retrieved.Manifests))
	}
}
