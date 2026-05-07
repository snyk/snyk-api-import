package utils

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppendJSONLine_Success(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "test.log")

	data := map[string]string{"key": "value", "status": "success"}

	err := AppendJSONLine(logFile, data)
	if err != nil {
		t.Fatalf("AppendJSONLine() error: %v", err)
	}

	// Read and verify
	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	var result map[string]string
	if err := json.Unmarshal(content, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if result["key"] != "value" {
		t.Errorf("Expected key='value', got %q", result["key"])
	}
	if result["status"] != "success" {
		t.Errorf("Expected status='success', got %q", result["status"])
	}

	// Verify newline at end
	if !strings.HasSuffix(string(content), "\n") {
		t.Error("JSON line should end with newline")
	}
}

func TestAppendJSONLine_MultipleLines(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "multi.log")

	// Append multiple lines
	for i := 1; i <= 3; i++ {
		data := map[string]int{"line": i}
		if err := AppendJSONLine(logFile, data); err != nil {
			t.Fatalf("AppendJSONLine() error on line %d: %v", i, err)
		}
	}

	// Read all lines
	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) != 3 {
		t.Errorf("Expected 3 lines, got %d", len(lines))
	}

	// Verify each line
	for i, line := range lines {
		var data map[string]int
		if err := json.Unmarshal([]byte(line), &data); err != nil {
			t.Errorf("Line %d unmarshal error: %v", i+1, err)
			continue
		}
		if data["line"] != i+1 {
			t.Errorf("Line %d: expected line=%d, got %d", i+1, i+1, data["line"])
		}
	}
}

func TestAppendJSONLine_EmptyPath(t *testing.T) {
	err := AppendJSONLine("", map[string]string{"test": "value"})
	if err == nil {
		t.Error("Expected error for empty path, got nil")
	}
	if !strings.Contains(err.Error(), "empty path") {
		t.Errorf("Expected 'empty path' error, got %v", err)
	}
}

func TestAppendJSONLine_CreatesDirectory(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "subdir", "nested", "test.log")

	err := AppendJSONLine(logFile, map[string]string{"test": "value"})
	if err != nil {
		t.Fatalf("AppendJSONLine() error: %v", err)
	}

	// Verify file and directory exist
	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		t.Error("Log file was not created")
	}
}

func TestAppendJSONLine_InvalidJSON(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "test.log")

	// Channel cannot be marshaled to JSON
	invalidData := make(chan int)

	err := AppendJSONLine(logFile, invalidData)
	if err == nil {
		t.Error("Expected error for invalid JSON data, got nil")
	}
	if !strings.Contains(err.Error(), "marshal json") {
		t.Errorf("Expected 'marshal json' error, got %v", err)
	}
}

func TestAppendBunyanJSONLine_Success(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "bunyan.log")

	payload := map[string]interface{}{
		"request_id": "req-123",
		"user":       "test-user",
	}

	err := AppendBunyanJSONLine(logFile, 30, "Test log message", payload)
	if err != nil {
		t.Fatalf("AppendBunyanJSONLine() error: %v", err)
	}

	// Read and verify
	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(content, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify envelope fields
	if result["level"].(float64) != 30 {
		t.Errorf("Expected level=30, got %v", result["level"])
	}
	if result["msg"] != "Test log message" {
		t.Errorf("Expected msg='Test log message', got %q", result["msg"])
	}
	if result["v"].(float64) != 0 {
		t.Errorf("Expected v=0, got %v", result["v"])
	}

	// Verify PID exists
	if _, ok := result["pid"]; !ok {
		t.Error("Expected 'pid' field in envelope")
	}

	// Verify hostname exists
	if _, ok := result["hostname"]; !ok {
		t.Error("Expected 'hostname' field in envelope")
	}

	// Verify time exists
	if _, ok := result["time"]; !ok {
		t.Error("Expected 'time' field in envelope")
	}

	// Verify payload fields were merged
	if result["request_id"] != "req-123" {
		t.Errorf("Expected request_id='req-123', got %v", result["request_id"])
	}
	if result["user"] != "test-user" {
		t.Errorf("Expected user='test-user', got %v", result["user"])
	}
}

func TestAppendBunyanJSONLine_NilPayload(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "bunyan-nil.log")

	err := AppendBunyanJSONLine(logFile, 40, "Message with nil payload", nil)
	if err != nil {
		t.Fatalf("AppendBunyanJSONLine() error: %v", err)
	}

	// Read and verify
	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(content, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if result["msg"] != "Message with nil payload" {
		t.Errorf("Expected msg='Message with nil payload', got %q", result["msg"])
	}
}

func TestAppendBunyanJSONLine_NonMapPayload(t *testing.T) {
	td := t.TempDir()
	logFile := filepath.Join(td, "bunyan-string.log")

	// String payload should be wrapped in "data" field
	err := AppendBunyanJSONLine(logFile, 20, "Info message", "simple string payload")
	if err != nil {
		t.Fatalf("AppendBunyanJSONLine() error: %v", err)
	}

	// Read and verify
	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(content, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if result["data"] != "simple string payload" {
		t.Errorf("Expected data='simple string payload', got %v", result["data"])
	}
}

func TestAppendBunyanJSONLine_EmptyPath(t *testing.T) {
	err := AppendBunyanJSONLine("", 30, "test", nil)
	if err == nil {
		t.Error("Expected error for empty path, got nil")
	}
	if !strings.Contains(err.Error(), "empty path") {
		t.Errorf("Expected 'empty path' error, got %v", err)
	}
}

func TestSafeOpenAppend_CreatesParentDir(t *testing.T) {
	td := t.TempDir()
	testFile := filepath.Join(td, "parent", "child", "file.txt")

	f, err := safeOpenAppend(testFile, os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatalf("safeOpenAppend() error: %v", err)
	}
	defer f.Close()

	// Verify parent directories exist
	if _, err := os.Stat(filepath.Dir(testFile)); os.IsNotExist(err) {
		t.Error("Parent directory was not created")
	}
}

func TestSafeOpenAppend_EmptyPath(t *testing.T) {
	_, err := safeOpenAppend("", os.O_CREATE|os.O_WRONLY, 0600)
	if err == nil {
		t.Error("Expected error for empty path, got nil")
	}
	if !strings.Contains(err.Error(), "empty path") {
		t.Errorf("Expected 'empty path' error, got %v", err)
	}
}

func TestTimeNowUTC(t *testing.T) {
	timestamp := timeNowUTC()
	if timestamp == "" {
		t.Error("timeNowUTC() returned empty string")
	}

	// Verify it's valid RFC3339
	// Should be in format: 2006-01-02T15:04:05Z
	if !strings.Contains(timestamp, "T") || !strings.HasSuffix(timestamp, "Z") {
		t.Errorf("timeNowUTC() returned invalid RFC3339 format: %q", timestamp)
	}
}
