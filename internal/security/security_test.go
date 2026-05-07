package security

// Removed duplicate package line

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveSafePath_InsideSnykLogPath(t *testing.T) {
	dir := t.TempDir()
	// set SNYK_LOG_PATH to temp dir
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")

	nested := filepath.Join(dir, "sub", "file.txt")
	if err := os.MkdirAll(filepath.Dir(nested), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(nested, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	resolved, err := ResolveSafePath(nested)
	if err != nil {
		t.Fatalf("ResolveSafePath failed: %v", err)
	}
	if resolved == "" {
		t.Fatalf("ResolveSafePath returned empty path")
	}
}

func TestResolveSafePath_AbsoluteRejectedWhenNoSnykLogPath(t *testing.T) {
	os.Unsetenv("SNYK_LOG_PATH")
	tmp := t.TempDir()
	// absolute path should be rejected when SNYK_LOG_PATH is not set
	_, err := ResolveSafePath(filepath.Join(tmp, "a.txt"))
	if err == nil {
		t.Fatalf("expected error for absolute path when SNYK_LOG_PATH unset, got nil")
	}
}

func TestSafeReadFile_MaxSizeEnforced(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")

	p := filepath.Join(dir, "f.txt")
	if err := os.WriteFile(p, []byte("0123456789"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// maxSize smaller than file size should produce an error
	if _, err := SafeReadFile(p, 5); err == nil {
		t.Fatalf("expected error for file exceeding maxSize")
	}
	// maxSize larger should succeed
	data, err := SafeReadFile(p, 100)
	if err != nil {
		t.Fatalf("SafeReadFile failed: %v", err)
	}
	if len(data) != 10 {
		t.Fatalf("unexpected data length: %d", len(data))
	}
}

func TestSafeOpenFile_CreateInsideSnykLogPath(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("SNYK_LOG_PATH", dir)
	defer os.Unsetenv("SNYK_LOG_PATH")

	target := filepath.Join(dir, "out", "x.log")
	f, err := SafeOpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		t.Fatalf("SafeOpenFile failed: %v", err)
	}
	if _, err := f.Write([]byte("ok")); err != nil {
		f.Close()
		t.Fatalf("write failed: %v", err)
	}
	_ = f.Close()
	// file should exist
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("expected file to exist: %v", err)
	}
}
