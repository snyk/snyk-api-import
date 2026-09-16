package internal

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
)

// IsUnsafePath checks if a path is potentially unsafe by checking for:
// 1. Empty paths
// 2. Paths containing path traversal sequences ('..' or '../')
// 3. Absolute paths outside of SNYK_LOG_PATH (if set)
// 4. Paths containing null bytes or other suspicious characters
func IsUnsafePath(path string) bool {
	// Check for empty path
	if path == "" {
		return true
	}

	// Check for null bytes or other suspicious characters
	if strings.ContainsAny(path, "\x00") {
		return true
	}

	// Get the base directory to contain all paths
	baseDir := os.Getenv("SNYK_LOG_PATH")
	if baseDir == "" {
		baseDir, _ = os.Getwd()
	}

	// Clean and resolve the path
	cleanPath := filepath.Clean(path)
	if cleanPath == "." || cleanPath == ".." || strings.HasPrefix(cleanPath, "../") {
		return true
	}

	// If it's an absolute path, check if it's within the base directory
	if filepath.IsAbs(cleanPath) {
		relPath, err := filepath.Rel(baseDir, cleanPath)
		if err != nil || strings.HasPrefix(relPath, "..") || strings.HasPrefix(relPath, "/") {
			return true
		}
		return false
	}

	// For relative paths, join with base directory and check
	fullPath := filepath.Join(baseDir, cleanPath)
	relPath, err := filepath.Rel(baseDir, fullPath)
	if err != nil || strings.HasPrefix(relPath, "..") || strings.HasPrefix(relPath, "/") {
		return true
	}

	return false
}

// SplitPath splits a path into its segments
func SplitPath(path string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(path); i++ {
		if path[i] == '/' || path[i] == '\\' {
			if start < i {
				parts = append(parts, path[start:i])
			}
			start = i + 1
		}
	}
	if start < len(path) {
		parts = append(parts, path[start:])
	}
	return parts
}

// GetEnv returns the environment variable value for key or an empty string if
// the variable is not set. Centralized here to avoid small duplicate helpers
// spread across the codebase and to make it easier to stub in tests.
func GetEnv(key string) string {
	return os.Getenv(key)
}

// AppConfig holds application configuration read from the environment.
// Keep it minimal and expand as needed when adopting a larger framework.
type AppConfig struct {
	SnykLogPath              string
	SnykToken                string
	OrgID                    string
	BitbucketAppClientID     string
	BitbucketAppClientSecret string
	// Logging configuration
	LogLevel      string // debug, info, warn, error
	LogMaxSizeMB  int    // rotate after this many megabytes
	LogMaxBackups int    // number of rotated files to keep
	LogMaxAgeDays int    // max age in days to retain old files
	LogCompress   bool   // compress rotated files
}

// LoadAppConfigFromEnv loads a typed AppConfig from environment variables.
func LoadAppConfigFromEnv() AppConfig {
	cfg := AppConfig{
		SnykLogPath:              GetEnv("SNYK_LOG_PATH"),
		SnykToken:                GetEnv("SNYK_TOKEN"),
		OrgID:                    GetEnv("ORG_ID"),
		BitbucketAppClientID:     GetEnv("BITBUCKET_APP_CLIENT_ID"),
		BitbucketAppClientSecret: GetEnv("BITBUCKET_APP_CLIENT_SECRET"),
		LogLevel:                 strings.ToLower(GetEnv("SNYK_LOG_LEVEL")),
	}

	// Parse optional numeric rotation settings with sane defaults
	if v := GetEnv("SNYK_LOG_MAX_SIZE_MB"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.LogMaxSizeMB = n
		}
	}
	if cfg.LogMaxSizeMB == 0 {
		cfg.LogMaxSizeMB = 10 // default 10MB
	}
	if v := GetEnv("SNYK_LOG_MAX_BACKUPS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			cfg.LogMaxBackups = n
		}
	}
	if cfg.LogMaxBackups == 0 {
		cfg.LogMaxBackups = 3
	}
	if v := GetEnv("SNYK_LOG_MAX_AGE_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			cfg.LogMaxAgeDays = n
		}
	}
	if cfg.LogMaxAgeDays == 0 {
		cfg.LogMaxAgeDays = 28
	}
	if v := GetEnv("SNYK_LOG_COMPRESS"); v != "" {
		// treat "1", "true", "yes" as true
		vv := strings.ToLower(v)
		if vv == "1" || vv == "true" || vv == "yes" {
			cfg.LogCompress = true
		}
	}

	return cfg
}

// ImportConfig represents the import config file structure
// Example:
//
//	{
//	  "source": "bitbucket-cloud", // or "bitbucket-cloud-app"
//	  "workspaces": ["myworkspace1", "myworkspace2"],
//	  "token": "...", // for bitbucket-cloud
//	  "clientID": "...", // for bitbucket-cloud-app
//	  "clientSecret": "..." // for bitbucket-cloud-app
//	}
type ImportConfig struct {
	Source       string   `json:"source"`
	Workspaces   []string `json:"workspaces"`
	Token        string   `json:"token,omitempty"`
	ClientID     string   `json:"clientID,omitempty"`
	ClientSecret string   `json:"clientSecret,omitempty"`
}

// LoadImportConfig loads the import config from a file after validating the path is safe
func LoadImportConfig(path string) (*ImportConfig, error) {
	// Validate the path is safe before proceeding
	if IsUnsafePath(path) {
		return nil, fmt.Errorf("invalid or unsafe config path: %s", path)
	}

	// Resolve the path to ensure it's within allowed directories
	resolvedPath, err := ResolveSafePath(path)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve config path: %w", err)
	}

	// Verify the file exists and is not a directory
	fileInfo, err := os.Stat(resolvedPath)
	if err != nil {
		return nil, fmt.Errorf("error accessing config file: %w", err)
	}
	if fileInfo.IsDir() {
		return nil, fmt.Errorf("config path is a directory, not a file: %s", resolvedPath)
	}

	// Limit file size to prevent DoS (e.g., 1MB max)
	if fileInfo.Size() > 1<<20 { // 1MB
		return nil, fmt.Errorf("config file too large: %d bytes", fileInfo.Size())
	}

	// Open the file with read-only permissions
	f, err := os.OpenFile(resolvedPath, os.O_RDONLY, 0)
	if err != nil {
		return nil, fmt.Errorf("error opening config file: %w", err)
	}
	defer func() {
		if closeErr := f.Close(); closeErr != nil {
			Logger.Errorf("error closing config file: %v", closeErr)
		}
	}()

	// Parse the JSON config
	var cfg ImportConfig
	decoder := json.NewDecoder(f)
	decoder.DisallowUnknownFields() // Prevent unknown fields in JSON

	if err := decoder.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("error decoding config: %w", err)
	}

	// Validate required fields
	if cfg.Source == "" {
		return nil, fmt.Errorf("missing required field: source")
	}

	return &cfg, nil
}

// ResolveSafePath resolves user-supplied paths in a safe manner and ensures
// the resulting path is confined to SNYK_LOG_PATH when that env var is set.
// Behavior:
//   - Expands environment variables in the input path.
//   - Returns an absolute, symlink-resolved path when possible.
//   - If SNYK_LOG_PATH is set, the resolved path must reside in that directory.
//   - If SNYK_LOG_PATH is not set, absolute paths are rejected and paths
//     containing ".." are rejected to avoid traversal.
func ResolveSafePath(userPath string) (string, error) {
	return ResolveSafePathWithLogPath(userPath, "")
}

// ResolveSafePathWithLogPath is like ResolveSafePath but accepts an explicit logPath.
// If logPath is empty, it falls back to SNYK_LOG_PATH environment variable.
func ResolveSafePathWithLogPath(userPath string, logPath string) (string, error) {
	if userPath == "" {
		return "", fmt.Errorf("empty path")
	}
	expanded := os.ExpandEnv(userPath)
	// Reject trivial or suspicious values early
	if expanded == "." || expanded == ".." {
		return "", fmt.Errorf("invalid path: %s", expanded)
	}

	// Compute absolute candidate
	absCandidate, err := filepath.Abs(expanded)
	if err != nil {
		return "", fmt.Errorf("resolve absolute path: %w", err)
	}

	// Try to evaluate symlinks; if it fails (file may not exist), fall back
	// to the absolute candidate so we still have a stable path to validate.
	evalCandidate, err := filepath.EvalSymlinks(absCandidate)
	if err != nil || evalCandidate == "" {
		evalCandidate = absCandidate
	}

	// In test mode, return the resolved path without strict containment checks
	// SNYK_TESTING_MODE=1 or SNYK_TEST_ALLOW_ABSOLUTE_PATH=1 enable test mode
	if os.Getenv("SNYK_TESTING_MODE") == "1" || os.Getenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH") == "1" {
		return evalCandidate, nil
	}

	// Use provided logPath, or fall back to environment variable
	if logPath == "" {
		logPath = os.Getenv("SNYK_LOG_PATH")
	}
	// For tests we may allow absolute paths to be accepted even if they are not
	// strictly under SNYK_LOG_PATH. Setting SNYK_TEST_ALLOW_ABSOLUTE_PATH=1
	// will cause ResolveSafePath to return absolute paths as-is after
	// normalization. This is intended for unit tests only.
	allowAbsolute := os.Getenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH") == "1"

	if logPath != "" {
		absLog, err := filepath.Abs(logPath)
		if err != nil {
			return "", fmt.Errorf("resolve SNYK_LOG_PATH: %w", err)
		}
		evalLog, err := filepath.EvalSymlinks(absLog)
		if err != nil || evalLog == "" {
			evalLog = absLog
		}
		// Ensure candidate is equal to or inside the log directory
		parentInfo, err := os.Stat(filepath.Clean(evalLog))
		if err != nil {
			return "", fmt.Errorf("invalid SNYK_LOG_PATH: %w", err)
		}

		inside := false
		// Walk up from evalCandidate to root, comparing filesystem identity
		cur := filepath.Clean(evalCandidate)
		for {
			info, err := os.Stat(cur)
			if err != nil {
				break
			}
			if os.SameFile(info, parentInfo) {
				inside = true
				break
			}
			parent := filepath.Dir(cur)
			if parent == cur || parent == "." {
				break
			}
			cur = parent
		}
		if !inside {
			// Fallback for macOS path representation differences ("/var/..." vs "/private/var/...").
			// Try normalized variants by adding or removing the "/private" prefix.
			tryNormalize := func(p string) []string {
				out := []string{p}
				if strings.HasPrefix(p, "/private/") {
					out = append(out, strings.TrimPrefix(p, "/private"))
				} else if strings.HasPrefix(p, "/var/") {
					out = append(out, filepath.Join("/private", p))
				}
				return out
			}
			evalVariants := tryNormalize(filepath.Clean(evalCandidate))
			logVariants := tryNormalize(filepath.Clean(evalLog))
			for _, ev := range evalVariants {
				for _, lv := range logVariants {
					if strings.HasPrefix(ev, lv) {
						inside = true
						break
					}
				}
				if inside {
					break
				}
			}
		}
		if !inside {
			if allowAbsolute {
				// Tests can opt-in to allow absolute paths; return the normalized
				// candidate instead of rejecting it.
				return evalCandidate, nil
			}
			return "", fmt.Errorf("path is outside of SNYK_LOG_PATH: %s", evalCandidate)
		}
		return evalCandidate, nil
	}

	// No SNYK_LOG_PATH configured: disallow absolute paths and any parent
	// directory traversal segments to avoid accidental reads outside cwd.
	if filepath.IsAbs(expanded) {
		return "", fmt.Errorf("absolute paths are not allowed when SNYK_LOG_PATH is not set")
	}
	for _, part := range SplitPath(expanded) {
		if part == ".." {
			return "", fmt.Errorf("path contains parent directory reference")
		}
	}
	return absCandidate, nil
}

// 2. HTTPS protocol only
// 3. Valid hostname that matches one of the allowed hosts
// 4. No IP address literals (prevents SSRF via internal IPs)
// 5. No authentication credentials in URL
// 6. No special URL schemes (javascript:, file:, etc.)
func IsAllowedRemoteURL(candidate string, allowedHosts []string) bool {
	if candidate == "" {
		Logger.Debugf("Rejected empty URL")
		return false
	}

	// Parse the URL
	parsed, err := url.Parse(candidate)
	if err != nil {
		Logger.Debugf("Failed to parse URL %q: %v", candidate, err)
		return false
	}

	// Enforce HTTPS only
	if parsed.Scheme != "https" {
		Logger.Debugf("Rejected non-HTTPS URL: %s", candidate)
		return false
	}

	// Reject URLs with authentication credentials
	if parsed.User != nil && (parsed.User.Username() != "" || parsed.User.String() != "") {
		// Log only scheme and hostname to avoid exposing embedded credentials
		Logger.Debugf("Rejected URL with embedded credentials: %s://%s/***", parsed.Scheme, parsed.Hostname())
		return false
	}

	// Reject IP addresses (IPv4 or IPv6) to prevent SSRF via internal IPs
	host := parsed.Hostname()
	if ip := net.ParseIP(host); ip != nil {
		Logger.Debugf("Rejected IP address in URL: %s", candidate)
		return false
	}

	// Validate port if present
	if parsed.Port() != "" {
		port, err := strconv.Atoi(parsed.Port())
		if err != nil || port < 1 || port > 65535 {
			Logger.Debugf("Invalid port in URL: %s", candidate)
			return false
		}
		// Optionally restrict to standard HTTPS port
		if port != 443 {
			Logger.Debugf("Rejected non-standard HTTPS port in URL: %s", candidate)
			return false
		}
	}

	// Check against allowed hosts
	for _, allowedHost := range allowedHosts {
		// Exact match
		if host == allowedHost {
			return true
		}
		// Subdomain match (e.g., api.example.com matches .example.com)
		if strings.HasSuffix(host, "."+allowedHost) {
			// Prevent partial matches (e.g., evil-example.com matching example.com)
			if len(host) > len(allowedHost) && host[len(host)-len(allowedHost)-1] == '.' {
				return true
			}
		}
	}

	Logger.Debugf("Rejected URL %q - host %q not in allowed hosts: %v", candidate, host, allowedHosts)
	return false
}

// SanitizeWorkspace validates and returns a canonical workspace name derived
// from user input. It guarantees the returned string only contains allowed
// characters (letters, digits, '-', '_' and '.') and starts with a letter.
// Use this before embedding workspace names into API paths.
func SanitizeWorkspace(ws string) (string, error) {
	if ws == "" {
		return "", fmt.Errorf("empty workspace")
	}
	// Trim whitespace
	ws = strings.TrimSpace(ws)
	if ws == "" {
		return "", fmt.Errorf("empty workspace after trim")
	}
	// Must start with a letter
	first := rune(ws[0])
	if !unicode.IsLetter(first) {
		return "", fmt.Errorf("workspace must start with a letter")
	}
	// Validate allowed characters
	for i := 0; i < len(ws); i++ {
		c := ws[i]
		ok := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.'
		if !ok {
			return "", fmt.Errorf("workspace contains invalid character: %q", c)
		}
	}
	return ws, nil
}
