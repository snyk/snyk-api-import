// Package buildinfo holds linker-injected version metadata shared by the CLI
// and packages that cannot import package main (e.g. internal/security).
package buildinfo

import "strings"

// Version is the semantic version (e.g. "v1.0.0") injected via -ldflags at link time.
var Version = "dev"

// GitCommit is the git commit SHA injected via -ldflags at link time.
var GitCommit = "unknown"

// BuildDate is the build timestamp (RFC3339) injected via -ldflags at link time.
var BuildDate = "unknown"

// UserAgent returns the HTTP User-Agent for outbound API requests.
func UserAgent() string {
	v := strings.TrimSpace(Version)
	if v == "" {
		v = "dev"
	}
	return "snyk-api-import/" + v
}
