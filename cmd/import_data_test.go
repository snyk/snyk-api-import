package cmd

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/sam1el/snyk-api-import-go/internal"
	"github.com/sam1el/snyk-api-import-go/internal/utils"
)

type fakeOutputDest struct {
	writtenPath string
	writtenBody []byte
}

func (f *fakeOutputDest) Println(a ...any) (n int, err error) { return 0, nil }
func (f *fakeOutputDest) Remove(name string) error            { return nil }
func (f *fakeOutputDest) WriteFile(filename string, data []byte, perm os.FileMode) error {
	f.writtenPath = filename
	f.writtenBody = append([]byte(nil), data...)
	return nil
}
func (f *fakeOutputDest) GetWriter() io.Writer { return os.Stdout }

func TestImportDataCmd_WritesTargetsUsingOutputDestination(t *testing.T) {
	td := t.TempDir()
	// create a simple orgs data file that will trigger the fallback branch in GenerateImportTargets
	orgsPath := filepath.Join(td, "orgs.json")
	// GenerateImportTargets expects the object shape: {"orgs":[...]}
	orgsContent := []byte(`{"orgs":[{"name":"acme"}]}`)
	if err := os.WriteFile(orgsPath, orgsContent, 0600); err != nil {
		t.Fatalf("failed to write orgs data: %v", err)
	}

	// ensure output is written into our temp dir
	// Resolve symlinks so ResolveSafePath comparisons match eval results on macOS (/var -> /private/var)
	if eval, err := filepath.EvalSymlinks(td); err == nil {
		if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	} else {
		if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
			t.Fatalf("setenv failed: %v", err)
		}
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	// inject fake output destination
	fake := &fakeOutputDest{}
	restore := utils.SetOutputDestinationFactory(func() utils.OutputDestination { return fake })
	defer restore()

	// Keep the relative name for clarity (not used below because we pass the absolute path).
	_ = "orgs.json"

	// Don't change working directory in tests. Allow ResolveSafePath to accept
	// the absolute fixture path by opting into the test override.
	if err := os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1"); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")
	// set args so the flag parsing in ImportDataCmd picks up our orgs file and uses a non-cloud-app source
	// Pass the absolute fixture path; ResolveSafePath will accept it because of the test env override.
	os.Args = []string{"prog", "import:data", "--orgsData=" + orgsPath, "--source=other", "--integrationId=ii-123"}

	// run the command (it should not os.Exit on success)
	ImportDataCmd(context.Background(), internal.AppConfig{})

	if fake.writtenPath == "" {
		t.Fatalf("expected WriteFile to be called, but it wasn't")
	}

	var parsed map[string]any
	if err := json.Unmarshal(fake.writtenBody, &parsed); err != nil {
		t.Fatalf("written output is not valid JSON: %v", err)
	}
	if _, ok := parsed["targets"]; !ok {
		t.Fatalf("expected 'targets' key in output, got: %v", parsed)
	}
}

func TestImportDataCmd_SourceUrlFlag(t *testing.T) {
	tests := []struct {
		name        string
		source      string
		sourceUrl   string
		expectedEnv string
		expectedVal string
	}{
		{
			name:        "GitHub with custom URL",
			source:      "github",
			sourceUrl:   "https://github.mycompany.com",
			expectedEnv: "GITHUB_API_URL",
			expectedVal: "https://github.mycompany.com",
		},
		{
			name:        "GitHub Cloud App with custom URL",
			source:      "github-cloud-app",
			sourceUrl:   "https://github.mycompany.com",
			expectedEnv: "GITHUB_API_URL",
			expectedVal: "https://github.mycompany.com",
		},
		{
			name:        "GitLab with custom URL",
			source:      "gitlab",
			sourceUrl:   "https://gitlab.mycompany.com",
			expectedEnv: "GITLAB_BASE_URL",
			expectedVal: "https://gitlab.mycompany.com",
		},
		{
			name:        "Azure with custom URL",
			source:      "azure-repos",
			sourceUrl:   "https://dev.azure.mycompany.com",
			expectedEnv: "AZURE_BASE_URL",
			expectedVal: "https://dev.azure.mycompany.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			td := t.TempDir()

			// Create a simple orgs data file
			orgsPath := filepath.Join(td, "orgs.json")
			orgsContent := []byte(`{"orgs":[{"name":"acme"}]}`)
			if err := os.WriteFile(orgsPath, orgsContent, 0600); err != nil {
				t.Fatalf("failed to write orgs data: %v", err)
			}

			// Set up environment
			if eval, err := filepath.EvalSymlinks(td); err == nil {
				if err := os.Setenv("SNYK_LOG_PATH", eval); err != nil {
					t.Fatalf("setenv failed: %v", err)
				}
			} else {
				if err := os.Setenv("SNYK_LOG_PATH", td); err != nil {
					t.Fatalf("setenv failed: %v", err)
				}
			}
			defer os.Unsetenv("SNYK_LOG_PATH")
			defer os.Unsetenv(tt.expectedEnv)

			if err := os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1"); err != nil {
				t.Fatalf("setenv failed: %v", err)
			}
			defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")

			// Set args with sourceUrl flag
			os.Args = []string{"prog", "import:data", "--orgsData=" + orgsPath, "--source=" + tt.source, "--sourceUrl=" + tt.sourceUrl}

			// Run the command
			ImportDataCmd(context.Background(), internal.AppConfig{})

			// Verify the environment variable was set
			got := os.Getenv(tt.expectedEnv)
			if got != tt.expectedVal {
				t.Errorf("Expected %s=%s, got %s", tt.expectedEnv, tt.expectedVal, got)
			}
		})
	}
}
