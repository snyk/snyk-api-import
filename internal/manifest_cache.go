package internal

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ManifestCache represents a cache of manifest discovery results
type ManifestCache struct {
	Version     string                     `json:"version"`
	OrgID       string                     `json:"org_id"`
	CreatedAt   time.Time                  `json:"created_at"`
	LastUpdated time.Time                  `json:"last_updated"`
	Repos       map[string]CachedRepoEntry `json:"repos"`
	Stats       CacheStats                 `json:"stats"`
	mu          sync.RWMutex               `json:"-"`
}

// CachedRepoEntry represents cached information for a single repository
type CachedRepoEntry struct {
	Owner           string    `json:"owner"`
	Repo            string    `json:"repo"`
	Branch          string    `json:"branch"`
	CommitSHA       string    `json:"commit_sha"`
	TreeSHA         string    `json:"tree_sha,omitempty"`        // Git tree SHA for tree-based discovery
	Manifests       []string  `json:"manifests"`                 // Deprecated: use SCAFiles
	SCAFiles        []string  `json:"sca_files,omitempty"`       // SCA dependency manifests
	IaCFiles        []string  `json:"iac_files,omitempty"`       // IaC configuration files
	ContainerFiles  []string  `json:"container_files,omitempty"` // Container/Docker files
	DiscoveryMethod string    `json:"discovery_method"`          // "api", "clone", "sparse", "tree"
	LastChecked     time.Time `json:"last_checked"`
	CheckCount      int       `json:"check_count"`
	APICalls        int       `json:"api_calls,omitempty"`
}

// CacheStats tracks cache performance metrics
type CacheStats struct {
	TotalRepos     int `json:"total_repos"`
	TotalManifests int `json:"total_manifests"`
	CacheHits      int `json:"cache_hits"`
	CacheMisses    int `json:"cache_misses"`
}

const (
	CacheVersion = "1.0"
	CacheFileExt = ".manifest-cache.json"
)

// NewManifestCache creates a new empty cache
func NewManifestCache(orgID string) *ManifestCache {
	now := time.Now()
	return &ManifestCache{
		Version:     CacheVersion,
		OrgID:       orgID,
		CreatedAt:   now,
		LastUpdated: now,
		Repos:       make(map[string]CachedRepoEntry),
		Stats:       CacheStats{},
	}
}

// LoadManifestCache loads a cache from disk, or creates a new one if it doesn't exist
func LoadManifestCache(cacheDir, orgID string) (*ManifestCache, error) {
	cachePath := GetCachePath(cacheDir, orgID)

	// Check if cache file exists
	if _, err := os.Stat(cachePath); os.IsNotExist(err) {
		Logger.Debugf("No cache found at %s, creating new cache", cachePath)
		return NewManifestCache(orgID), nil
	}

	// Read cache file
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return nil, fmt.Errorf("read cache file: %w", err)
	}

	// Parse cache
	var cache ManifestCache
	if err := json.Unmarshal(data, &cache); err != nil {
		Logger.Warnf("Failed to parse cache file %s: %v, creating new cache", cachePath, err)
		return NewManifestCache(orgID), nil
	}

	// Validate cache version
	if cache.Version != CacheVersion {
		Logger.Warnf("Cache version mismatch (expected %s, got %s), creating new cache", CacheVersion, cache.Version)
		return NewManifestCache(orgID), nil
	}

	Logger.Infof("Loaded manifest cache for org %s: %d repos, %d manifests",
		orgID, cache.Stats.TotalRepos, cache.Stats.TotalManifests)

	return &cache, nil
}

// SaveManifestCache saves the cache to disk
func (c *ManifestCache) Save(cacheDir string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	cachePath := GetCachePath(cacheDir, c.OrgID)

	// Ensure cache directory exists
	if err := os.MkdirAll(filepath.Dir(cachePath), 0755); err != nil {
		return fmt.Errorf("create cache directory: %w", err)
	}

	// Update last updated time
	c.LastUpdated = time.Now()

	// Update stats
	c.Stats.TotalRepos = len(c.Repos)
	c.Stats.TotalManifests = 0
	for _, entry := range c.Repos {
		c.Stats.TotalManifests += len(entry.Manifests)
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal cache: %w", err)
	}

	// Write to file atomically (write to temp file, then rename)
	tempPath := cachePath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return fmt.Errorf("write cache file: %w", err)
	}

	if err := os.Rename(tempPath, cachePath); err != nil {
		return fmt.Errorf("rename cache file: %w", err)
	}

	Logger.Debugf("Saved manifest cache to %s (%d repos)", cachePath, len(c.Repos))
	return nil
}

// Get retrieves a cached entry for a repository
func (c *ManifestCache) Get(owner, repo, branch string) (*CachedRepoEntry, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	key := makeCacheKey(owner, repo, branch)
	entry, exists := c.Repos[key]
	if exists {
		c.Stats.CacheHits++
		return &entry, true
	}

	c.Stats.CacheMisses++
	return nil, false
}

// Set stores a cache entry for a repository
func (c *ManifestCache) Set(owner, repo, branch, commitSHA string, manifests []string, method string, apiCalls int) {
	c.mu.Lock()
	defer c.mu.Unlock()

	key := makeCacheKey(owner, repo, branch)

	// Get existing entry to preserve check count
	existing, exists := c.Repos[key]
	checkCount := 1
	if exists {
		checkCount = existing.CheckCount + 1
	}

	c.Repos[key] = CachedRepoEntry{
		Owner:           owner,
		Repo:            repo,
		Branch:          branch,
		CommitSHA:       commitSHA,
		Manifests:       manifests,
		DiscoveryMethod: method,
		LastChecked:     time.Now(),
		CheckCount:      checkCount,
		APICalls:        apiCalls,
	}
	c.LastUpdated = time.Now()
}

// SetEntry adds or updates a cache entry with full control over all fields
func (c *ManifestCache) SetEntry(owner, repo, branch string, entry CachedRepoEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	key := makeCacheKey(owner, repo, branch)

	// Preserve/increment check count from existing entry
	if existing, exists := c.Repos[key]; exists {
		entry.CheckCount = existing.CheckCount + 1
	} else if entry.CheckCount == 0 {
		entry.CheckCount = 1
	}

	c.Repos[key] = entry
	c.LastUpdated = time.Now()
}

// IsValid checks if a cached entry is still valid for the given commit SHA
func (c *ManifestCache) IsValid(owner, repo, branch, currentCommitSHA string) bool {
	entry, exists := c.Get(owner, repo, branch)
	if !exists {
		return false
	}

	// Cache is valid if commit SHA matches
	return entry.CommitSHA == currentCommitSHA
}

// Invalidate removes a cache entry
func (c *ManifestCache) Invalidate(owner, repo, branch string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	key := makeCacheKey(owner, repo, branch)
	delete(c.Repos, key)
	Logger.Debugf("Invalidated cache entry for %s/%s@%s", owner, repo, branch)
}

// Clear removes all cache entries
func (c *ManifestCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.Repos = make(map[string]CachedRepoEntry)
	c.Stats = CacheStats{}
	Logger.Infof("Cleared all cache entries for org %s", c.OrgID)
}

// Cleanup removes cache entries older than the specified duration
func (c *ManifestCache) Cleanup(maxAge time.Duration) int {
	c.mu.Lock()
	defer c.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	removed := 0

	for key, entry := range c.Repos {
		if entry.LastChecked.Before(cutoff) {
			delete(c.Repos, key)
			removed++
		}
	}

	if removed > 0 {
		Logger.Infof("Cleaned up %d cache entries older than %v", removed, maxAge)
	}

	return removed
}

// GetStats returns current cache statistics
func (c *ManifestCache) GetStats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	stats := c.Stats
	stats.TotalRepos = len(c.Repos)
	stats.TotalManifests = 0
	for _, entry := range c.Repos {
		stats.TotalManifests += len(entry.Manifests)
	}

	return stats
}

// GetCachePath returns the file path for a cache file
func GetCachePath(cacheDir, orgID string) string {
	if cacheDir == "" {
		// Default to $SNYK_LOG_PATH/cache/
		snykLogPath := os.Getenv("SNYK_LOG_PATH")
		if snykLogPath != "" {
			cacheDir = filepath.Join(snykLogPath, "cache")
		} else {
			// Fallback to ~/.snyk-api-import/cache/
			homeDir, err := os.UserHomeDir()
			if err != nil {
				// Final fallback to temp directory
				cacheDir = filepath.Join(os.TempDir(), "snyk-api-import", "cache")
			} else {
				cacheDir = filepath.Join(homeDir, ".snyk-api-import", "cache")
			}
		}
	}

	filename := orgID + CacheFileExt
	return filepath.Join(cacheDir, filename)
}

// makeCacheKey creates a unique key for a repository
func makeCacheKey(owner, repo, branch string) string {
	return fmt.Sprintf("%s/%s@%s", owner, repo, branch)
}

// ClearCacheForOrg removes the cache file for a specific organization
func ClearCacheForOrg(cacheDir, orgID string) error {
	cachePath := GetCachePath(cacheDir, orgID)

	if err := os.Remove(cachePath); err != nil {
		if os.IsNotExist(err) {
			Logger.Infof("No cache file to remove for org %s", orgID)
			return nil
		}
		return fmt.Errorf("remove cache file: %w", err)
	}

	Logger.Infof("Removed cache file for org %s", orgID)
	return nil
}

// GetCacheSize returns the size of the cache file in bytes
func GetCacheSize(cacheDir, orgID string) (int64, error) {
	cachePath := GetCachePath(cacheDir, orgID)

	info, err := os.Stat(cachePath)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	return info.Size(), nil
}

// GetAllFiles returns all files from the cache entry (SCA + IaC + Container)
func (e *CachedRepoEntry) GetAllFiles() []string {
	// For backward compatibility, check Manifests first
	if len(e.Manifests) > 0 && len(e.SCAFiles) == 0 {
		return e.Manifests
	}

	allFiles := make([]string, 0, len(e.SCAFiles)+len(e.IaCFiles)+len(e.ContainerFiles))
	allFiles = append(allFiles, e.SCAFiles...)
	allFiles = append(allFiles, e.IaCFiles...)
	allFiles = append(allFiles, e.ContainerFiles...)
	return allFiles
}

// GetFilesByType returns files of a specific product type
func (e *CachedRepoEntry) GetFilesByType(productType string) []string {
	switch productType {
	case "sca", "openSource":
		if len(e.SCAFiles) > 0 {
			return e.SCAFiles
		}
		// Backward compatibility
		return e.Manifests
	case "iac", "infrastructure":
		return e.IaCFiles
	case "container":
		return e.ContainerFiles
	default:
		return e.GetAllFiles()
	}
}

// HasFiles returns true if the entry has any files of the specified type
func (e *CachedRepoEntry) HasFiles(productType string) bool {
	return len(e.GetFilesByType(productType)) > 0
}
