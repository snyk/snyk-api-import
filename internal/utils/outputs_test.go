package utils

import (
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewOutputDestination(t *testing.T) {
	dest := NewOutputDestination()
	if dest == nil {
		t.Fatal("NewOutputDestination() returned nil")
	}
}

func TestOutputDestinationImpl_Println(t *testing.T) {
	dest := &OutputDestinationImpl{}

	// Capture stdout
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	n, err := dest.Println("test", "message")

	w.Close()
	os.Stdout = old

	var buf bytes.Buffer
	_, _ = io.Copy(&buf, r)

	if err != nil {
		t.Errorf("Println() error: %v", err)
	}
	if n == 0 {
		t.Error("Println() returned 0 bytes written")
	}

	output := buf.String()
	if !strings.Contains(output, "test") || !strings.Contains(output, "message") {
		t.Errorf("Println() output missing expected content: %q", output)
	}
}

func TestOutputDestinationImpl_Remove(t *testing.T) {
	td := t.TempDir()
	testFile := filepath.Join(td, "test.txt")

	// Create a file
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	dest := &OutputDestinationImpl{}
	err := dest.Remove(testFile)
	if err != nil {
		t.Errorf("Remove() error: %v", err)
	}

	// Verify file is removed
	if _, err := os.Stat(testFile); !os.IsNotExist(err) {
		t.Error("File still exists after Remove()")
	}
}

func TestOutputDestinationImpl_Remove_NonExistentFile(t *testing.T) {
	td := t.TempDir()
	testFile := filepath.Join(td, "nonexistent.txt")

	dest := &OutputDestinationImpl{}
	err := dest.Remove(testFile)
	if err == nil {
		t.Error("Expected error for removing non-existent file, got nil")
	}
}

func TestOutputDestinationImpl_WriteFile(t *testing.T) {
	td := t.TempDir()
	testFile := filepath.Join(td, "output.txt")
	testData := []byte("test content")

	dest := &OutputDestinationImpl{}
	err := dest.WriteFile(testFile, testData, 0644)
	if err != nil {
		t.Errorf("WriteFile() error: %v", err)
	}

	// Verify file content
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Fatalf("Failed to read written file: %v", err)
	}
	if string(content) != "test content" {
		t.Errorf("Expected content %q, got %q", "test content", string(content))
	}

	// Verify permissions
	info, err := os.Stat(testFile)
	if err != nil {
		t.Fatalf("Failed to stat file: %v", err)
	}
	if info.Mode().Perm() != 0644 {
		t.Errorf("Expected permissions 0644, got %v", info.Mode().Perm())
	}
}

func TestOutputDestinationImpl_WriteFile_InvalidPath(t *testing.T) {
	dest := &OutputDestinationImpl{}

	// Try to write to invalid path (assuming /nonexistent doesn't exist)
	err := dest.WriteFile("/nonexistent/dir/file.txt", []byte("test"), 0644)
	if err == nil {
		t.Error("Expected error for invalid path, got nil")
	}
}

func TestOutputDestinationImpl_GetWriter(t *testing.T) {
	dest := &OutputDestinationImpl{}
	writer := dest.GetWriter()

	if writer == nil {
		t.Error("GetWriter() returned nil")
	}

	// Verify it's os.Stdout
	if writer != os.Stdout {
		t.Error("GetWriter() did not return os.Stdout")
	}
}

func TestSetOutputDestinationFactory(t *testing.T) {
	mockDest := &mockOutputDestination{}

	// Set mock factory
	restore := SetOutputDestinationFactory(func() OutputDestination {
		return mockDest
	})
	defer restore()

	// Verify factory was overridden
	dest := NewOutputDestination()
	if dest != mockDest {
		t.Error("SetOutputDestinationFactory did not override factory")
	}

	// Verify restore works
	restore()
	destAfterRestore := NewOutputDestination()
	if destAfterRestore == mockDest {
		t.Error("Restore did not reset factory")
	}
}

func TestSetOutputDestinationFactory_MultipleOverrides(t *testing.T) {
	mock1 := &mockOutputDestination{id: "mock1"}
	mock2 := &mockOutputDestination{id: "mock2"}

	// First override
	restore1 := SetOutputDestinationFactory(func() OutputDestination { return mock1 })
	if NewOutputDestination() != mock1 {
		t.Error("First override failed")
	}

	// Second override
	restore2 := SetOutputDestinationFactory(func() OutputDestination { return mock2 })
	if NewOutputDestination() != mock2 {
		t.Error("Second override failed")
	}

	// Restore in reverse order
	restore2()
	if NewOutputDestination() != mock1 {
		t.Error("Second restore didn't return to first override")
	}

	restore1()
	// Should be back to default
	dest := NewOutputDestination()
	if dest == mock1 || dest == mock2 {
		t.Error("First restore didn't return to default")
	}
}

func TestOutputDestination_IntegrationWithMock(t *testing.T) {
	mock := &mockOutputDestination{
		printBuffer:  &bytes.Buffer{},
		writtenFiles: make(map[string][]byte),
	}

	restore := SetOutputDestinationFactory(func() OutputDestination { return mock })
	defer restore()

	dest := NewOutputDestination()

	// Test Println
	_, _ = dest.Println("test message")
	if !strings.Contains(mock.printBuffer.String(), "test message") {
		t.Error("Println did not write to mock buffer")
	}

	// Test WriteFile
	err := dest.WriteFile("test.txt", []byte("content"), 0644)
	if err != nil {
		t.Errorf("WriteFile error: %v", err)
	}
	if string(mock.writtenFiles["test.txt"]) != "content" {
		t.Error("WriteFile did not store content in mock")
	}

	// Test Remove
	err = dest.Remove("test.txt")
	if err != nil {
		t.Errorf("Remove error: %v", err)
	}
	if _, exists := mock.writtenFiles["test.txt"]; exists {
		t.Error("Remove did not remove file from mock")
	}
}

// mockOutputDestination is a test mock
type mockOutputDestination struct {
	id           string
	printBuffer  *bytes.Buffer
	writtenFiles map[string][]byte
}

func (m *mockOutputDestination) Println(a ...any) (n int, err error) {
	if m.printBuffer == nil {
		m.printBuffer = &bytes.Buffer{}
	}
	return fmt.Fprintln(m.printBuffer, a...)
}

func (m *mockOutputDestination) Remove(name string) error {
	if m.writtenFiles == nil {
		return fmt.Errorf("file not found: %s", name)
	}
	if _, exists := m.writtenFiles[name]; !exists {
		return fmt.Errorf("file not found: %s", name)
	}
	delete(m.writtenFiles, name)
	return nil
}

func (m *mockOutputDestination) WriteFile(filename string, data []byte, perm fs.FileMode) error {
	if m.writtenFiles == nil {
		m.writtenFiles = make(map[string][]byte)
	}
	m.writtenFiles[filename] = data
	return nil
}

func (m *mockOutputDestination) GetWriter() io.Writer {
	if m.printBuffer == nil {
		m.printBuffer = &bytes.Buffer{}
	}
	return m.printBuffer
}
