package internal

import (
	"context"
	"os"
	"testing"

	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"
)

// TestDiscoverFilesViaTree_Manual is a manual test for tree-based discovery
// Run with: go test -v -run TestDiscoverFilesViaTree_Manual ./internal
// Requires: GITHUB_TOKEN environment variable
func TestDiscoverFilesViaTree_Manual(t *testing.T) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		t.Skip("Skipping manual test: GITHUB_TOKEN not set")
	}

	ctx := context.Background()
	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	tc := oauth2.NewClient(ctx, ts)
	client := github.NewClient(tc)

	// Test with go-repo-man (has SCA, IaC, and Container files)
	t.Log("Testing tree-based discovery on automata-devops-io/go-repo-man...")

	result, err := DiscoverFilesViaTree(ctx, client, "automata-devops-io", "go-repo-man", "main")
	if err != nil {
		t.Fatalf("DiscoverFilesViaTree failed: %v", err)
	}

	t.Logf("📊 Discovery Results:")
	t.Logf("  Commit SHA: %s", result.CommitSHA[:8])
	t.Logf("  Tree SHA:   %s", result.TreeSHA[:8])
	t.Logf("  API Calls:  %d", result.APICalls)
	t.Logf("  Time:       %v", result.DiscoveryTime)
	t.Logf("  Total Files: %d", len(result.AllFiles))

	t.Logf("✅ SCA Files (%d):", len(result.SCAFiles))
	for _, f := range result.SCAFiles {
		t.Logf("   - %s", f)
	}

	t.Logf("🏗️  IaC Files (%d):", len(result.IaCFiles))
	for _, f := range result.IaCFiles {
		t.Logf("   - %s", f)
	}

	t.Logf("🐳 Container Files (%d):", len(result.ContainerFiles))
	for _, f := range result.ContainerFiles {
		t.Logf("   - %s", f)
	}

	// Assertions
	if len(result.SCAFiles) == 0 {
		t.Error("Expected to find SCA files (go.mod)")
	}

	if len(result.IaCFiles) == 0 {
		t.Error("Expected to find IaC files (.tf files)")
	}

	if len(result.ContainerFiles) == 0 {
		t.Error("Expected to find Container files (Dockerfile)")
	}

	if result.APICalls != 2 {
		t.Errorf("Expected 2 API calls (branch + tree), got %d", result.APICalls)
	}

	t.Log("✅ Tree-based discovery test completed successfully!")
}
