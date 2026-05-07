package security

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// TestingModeEnv is the environment variable to enable testing mode
// When set to "1", security path validations are relaxed for testing
const TestingModeEnv = "SNYK_TESTING_MODE"

// isTestMode returns true if the application is running in testing mode
func isTestMode() bool {
	return os.Getenv(TestingModeEnv) == "1"
}

// DefaultAllowedHosts are the hosts that are allowed by default
var DefaultAllowedHosts = []string{
	// Snyk - US-01 (default)
	"api.snyk.io",
	"app.snyk.io",
	"snyk.io",
	// Snyk - US-02
	"api.us.snyk.io",
	"app.us.snyk.io",
	// Snyk - EU-01
	"api.eu.snyk.io",
	"app.eu.snyk.io",
	// Snyk - AU-01
	"api.au.snyk.io",
	"app.au.snyk.io",
	// Bitbucket
	"api.bitbucket.org",
	"bitbucket.org",
	// GitHub
	"api.github.com",
	"github.com",
	// GitLab
	"gitlab.com",
	// Azure DevOps
	"visualstudio.com",       // covers app.vssps.visualstudio.com and on-premise instances
	"dev.azure.com",          // Azure DevOps Services
	"vssps.visualstudio.com", // Visual Studio Profile Service
}

// SafeHTTPClient returns a configured HTTP client with security best practices
func SafeHTTPClient() *http.Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   30 * time.Second,
		Transport: transport,
	}
}

// IsSafeURL validates that a URL is safe to access
func IsSafeURL(rawURL string, allowedHosts []string) error {
	if rawURL == "" {
		return fmt.Errorf("empty URL")
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	// Enforce HTTPS
	if parsed.Scheme != "https" {
		return fmt.Errorf("only HTTPS URLs are allowed")
	}

	// Reject URLs with authentication
	if parsed.User != nil && (parsed.User.Username() != "" || parsed.User.String() != "") {
		return fmt.Errorf("URLs with authentication are not allowed")
	}

	// Reject IP addresses
	host := parsed.Hostname()
	if ip := net.ParseIP(host); ip != nil {
		return fmt.Errorf("IP addresses are not allowed")
	}

	// Validate port if present
	if port := parsed.Port(); port != "" {
		if p, err := strconv.Atoi(port); err != nil || p < 1 || p > 65535 {
			return fmt.Errorf("invalid port number")
		}
	}

	// Check against allowed hosts
	for _, allowed := range allowedHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return nil
		}
	}

	return fmt.Errorf("host not in allowed list")
}

// IsValidIdentifier validates that a string contains only safe characters
// suitable for use as a workspace, organization, or repository identifier.
// This prevents injection attacks when identifiers are used in API URLs.
// Valid characters: alphanumeric, hyphens, underscores
// Max length: 100 characters
func IsValidIdentifier(name string) bool {
	if name == "" || len(name) > 100 {
		return false
	}

	// Check for valid characters only
	for _, c := range name {
		if (c < 'a' || c > 'z') &&
			(c < 'A' || c > 'Z') &&
			(c < '0' || c > '9') &&
			c != '-' &&
			c != '_' {
			return false
		}
	}

	// Prevent path traversal attempts
	if strings.Contains(name, "..") ||
		strings.Contains(name, "./") ||
		strings.Contains(name, "//") {
		return false
	}

	return true
}

// SafeReadFile reads a file with security validations
// In testing mode (SNYK_TESTING_MODE=1), only validates file size
func SafeReadFile(path string, maxSize int64) ([]byte, error) {
	// In test mode, skip path security checks but still validate size
	if isTestMode() {
		fileInfo, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("error accessing file: %w", err)
		}

		if fileInfo.IsDir() {
			return nil, fmt.Errorf("path is a directory: %s", path)
		}

		if maxSize > 0 && fileInfo.Size() > maxSize {
			return nil, fmt.Errorf("file too large: %d bytes (max %d)", fileInfo.Size(), maxSize)
		}

		return os.ReadFile(path)
	}

	// Production mode: full security validation
	if IsUnsafePath(path) {
		return nil, fmt.Errorf("invalid or unsafe path: %s", path)
	}

	resolved, err := ResolveSafePath(path)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve path: %w", err)
	}

	fileInfo, err := os.Stat(resolved)
	if err != nil {
		return nil, fmt.Errorf("error accessing file: %w", err)
	}

	if fileInfo.IsDir() {
		return nil, fmt.Errorf("path is a directory: %s", resolved)
	}

	if maxSize > 0 && fileInfo.Size() > maxSize {
		return nil, fmt.Errorf("file too large: %d bytes (max %d)", fileInfo.Size(), maxSize)
	}

	file, err := os.OpenFile(resolved, os.O_RDONLY, 0)
	if err != nil {
		return nil, fmt.Errorf("error opening file: %w", err)
	}
	defer func() {
		if cerr := file.Close(); cerr != nil {
			// Log to stderr here to avoid importing internal package (would create
			// an import cycle). This is best-effort cleanup logging.
			fmt.Fprintf(os.Stderr, "warning: failed to close file %s: %v\n", resolved, cerr)
		}
	}()

	// Use a LimitedReader to prevent reading more than maxSize bytes
	limitedReader := &io.LimitedReader{R: file, N: maxSize + 1}
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}

	if limitedReader.N <= 0 {
		return nil, fmt.Errorf("file exceeds maximum size of %d bytes", maxSize)
	}

	return data, nil
}

// SafeOpenFile opens a file for writing with security checks. It resolves the
// path via ResolveSafePath and ensures the directory is inside allowed area.
// In testing mode (SNYK_TESTING_MODE=1), skips path security validation
func SafeOpenFile(path string, flag int, perm os.FileMode) (*os.File, error) {
	// In test mode, skip path security checks
	if isTestMode() {
		dir := filepath.Dir(path)
		if dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0700); err != nil {
				return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
			}
		}
		return os.OpenFile(path, flag, perm)
	}

	// Production mode: full security validation
	if IsUnsafePath(path) {
		return nil, fmt.Errorf("invalid or unsafe path: %s", path)
	}
	resolved, err := ResolveSafePath(path)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve path: %w", err)
	}
	// Ensure parent directory exists and is inside allowed area
	dir := filepath.Dir(resolved)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}
	// Open with provided flags and permissions
	f, err := os.OpenFile(resolved, flag, perm)
	if err != nil {
		return nil, fmt.Errorf("error opening file: %w", err)
	}
	return f, nil
}

// ResolveSafePath resolves a path safely, ensuring it's within allowed directories
// In testing mode (SNYK_TESTING_MODE=1), returns resolved absolute path without strict validation
func ResolveSafePath(userPath string) (string, error) {
	expanded := os.ExpandEnv(userPath)
	if expanded == "" {
		return "", fmt.Errorf("empty path")
	}

	// Reject trivial or suspicious values
	if expanded == "." || expanded == ".." {
		return "", fmt.Errorf("invalid path: %s", expanded)
	}

	// Compute absolute candidate
	abspath, err := filepath.Abs(expanded)
	if err != nil {
		return "", fmt.Errorf("resolve absolute path: %w", err)
	}

	// Try to evaluate symlinks; if it fails, use the absolute path
	evalPath, err := filepath.EvalSymlinks(abspath)
	if err != nil || evalPath == "" {
		evalPath = abspath
	}

	// In test mode, return the resolved path without strict containment checks
	if isTestMode() {
		return evalPath, nil
	}

	// Ensure the path is within SNYK_LOG_PATH if set
	if logPath := os.Getenv("SNYK_LOG_PATH"); logPath != "" {
		// Resolve and evaluate symlinks for the configured log path as well
		logAbs, err := filepath.Abs(logPath)
		if err != nil {
			return "", fmt.Errorf("invalid SNYK_LOG_PATH: %w", err)
		}
		logEval, err := filepath.EvalSymlinks(logAbs)
		if err != nil || logEval == "" {
			// Fallback to absolute if EvalSymlinks fails
			logEval = logAbs
		}

		// Use filesystem identity (inode/device) to determine containment. This
		// is robust across symlinked macOS paths that may appear as
		// "/var/..." vs "/private/var/...".
		parentInfo, err := os.Stat(filepath.Clean(logEval))
		if err != nil {
			return "", fmt.Errorf("invalid SNYK_LOG_PATH: %w", err)
		}

		inside := false
		// Walk up from evalPath to root, comparing filesystem identity
		cur := filepath.Clean(evalPath)
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
			evalVariants := tryNormalize(filepath.Clean(evalPath))
			logVariants := tryNormalize(filepath.Clean(logEval))
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
			return "", fmt.Errorf("path is outside of SNYK_LOG_PATH: %s", evalPath)
		}
	} else if filepath.IsAbs(evalPath) {
		// Reject absolute paths when SNYK_LOG_PATH is not set
		return "", fmt.Errorf("absolute paths are not allowed when SNYK_LOG_PATH is not set")
	}

	return evalPath, nil
}

// IsUnsafePath checks if a path is potentially unsafe
func IsUnsafePath(path string) bool {
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
		var err error
		baseDir, err = os.Getwd()
		if err != nil {
			return true
		}
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
