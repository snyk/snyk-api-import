package cmd

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/snyk/snyk-api-import/internal/utils"
)

type fakeOutputDest2 struct {
	writtenPath string
	writtenBody []byte
}

func (f *fakeOutputDest2) Println(a ...any) (n int, err error) { return 0, nil }
func (f *fakeOutputDest2) Remove(name string) error            { return nil }
func (f *fakeOutputDest2) WriteFile(filename string, data []byte, perm os.FileMode) error {
	f.writtenPath = filename
	f.writtenBody = append([]byte(nil), data...)
	return nil
}
func (f *fakeOutputDest2) GetWriter() io.Writer { return os.Stdout }

func TestWriteResults_UsesOutputDestination(t *testing.T) {
	td := t.TempDir()
	eval, err := filepath.EvalSymlinks(td)
	if err == nil {
		_ = os.Setenv("SNYK_LOG_PATH", eval)
	} else {
		_ = os.Setenv("SNYK_LOG_PATH", td)
	}
	defer os.Unsetenv("SNYK_LOG_PATH")

	// Allow absolute paths in tests
	_ = os.Setenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH", "1")
	defer os.Unsetenv("SNYK_TEST_ALLOW_ABSOLUTE_PATH")

	fake := &fakeOutputDest2{}
	restore := utils.SetOutputDestinationFactory(func() utils.OutputDestination { return fake })
	defer restore()

	outPath := filepath.Join(td, "my-results.json")
	results := map[string]interface{}{"ok": true, "count": 3}

	writeResults(outPath, results)

	if fake.writtenPath == "" {
		t.Fatalf("expected WriteFile to be called, but it wasn't")
	}
	var parsed map[string]any
	if err := json.Unmarshal(fake.writtenBody, &parsed); err != nil {
		t.Fatalf("written output is not valid JSON: %v", err)
	}
	if parsed["ok"] != true {
		t.Fatalf("expected ok=true in results, got: %v", parsed)
	}
}
