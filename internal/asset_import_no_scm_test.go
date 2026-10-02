package internal

import (
	"go/parser"
	"go/token"
	"strings"
	"testing"
)

// TestAssetImportFilesCallOnlySnyk guards the invariant this feature is built
// to: asset-import reads from and writes to Snyk only, and never calls an SCM
// directly (that's asset-tagger's job, upstream). The rest of this package
// legitimately imports go-github and the GitLab client for other commands
// (sync, import), so a whole-module or whole-package dependency check would
// always fail here regardless of this feature - this checks only the files
// that make up asset-import itself.
//
// A gap here is meant to fail loudly for anyone who wasn't in the room when
// this rule was decided: if asset-import ever needs SCM data, the answer is a
// new tag written by asset-tagger, not a new import here.
func TestAssetImportFilesCallOnlySnyk(t *testing.T) {
	assetImportFiles := []string{
		"asset_import.go",
		"asset_import_client.go",
		"asset_import_tags.go",
	}

	disallowedImportPrefixes := []string{
		"github.com/google/go-github",
		"gitlab.com/gitlab-org/api/client-go",
		"golang.org/x/oauth2/github",
	}

	fset := token.NewFileSet()
	for _, file := range assetImportFiles {
		f, err := parser.ParseFile(fset, file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}
		for _, imp := range f.Imports {
			path := strings.Trim(imp.Path.Value, `"`)
			for _, bad := range disallowedImportPrefixes {
				if strings.HasPrefix(path, bad) {
					t.Errorf("%s imports %q, which is an SCM client - asset-import must talk only to Snyk (see docs/asset-import-api-findings.md)", file, path)
				}
			}
		}
	}
}
