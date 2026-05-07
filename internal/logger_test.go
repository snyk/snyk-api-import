package internal

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetDebug_EnableDebug(t *testing.T) {
	originalLevel := Logger.GetLevel()
	defer Logger.SetLevel(originalLevel)

	SetDebug(true)
	assert.Equal(t, logrus.DebugLevel, Logger.GetLevel())
}

func TestSetDebug_DisableDebug(t *testing.T) {
	// Set to debug first
	Logger.SetLevel(logrus.DebugLevel)

	SetDebug(false)
	// SetDebug(false) doesn't change level, only SetDebug(true) sets it to debug
	assert.Equal(t, logrus.DebugLevel, Logger.GetLevel())
}

func TestWriteToLogFile_WithValidFile(t *testing.T) {
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "test.log")

	f, err := os.Create(logFile)
	require.NoError(t, err)
	defer f.Close()

	err = WriteToLogFile(f, "info", "Test message: %s\n", "hello")
	require.NoError(t, err)

	// Verify file content
	content, err := os.ReadFile(logFile)
	require.NoError(t, err)
	assert.Contains(t, string(content), "Test message: hello")
}

func TestWriteToLogFile_NilFile(t *testing.T) {
	// Should not error when file is nil
	err := WriteToLogFile(nil, "info", "Test message")
	assert.NoError(t, err)
}

func TestWriteToLogFile_Levels(t *testing.T) {
	tmpDir := t.TempDir()

	tests := []struct {
		name  string
		level string
	}{
		{"debug level", "debug"},
		{"info level", "info"},
		{"warn level", "warn"},
		{"warning level", "warning"},
		{"error level", "error"},
		{"unknown level", "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logFile := filepath.Join(tmpDir, tt.name+".log")
			f, err := os.Create(logFile)
			require.NoError(t, err)
			defer f.Close()

			err = WriteToLogFile(f, tt.level, "Test %s message\n", tt.level)
			assert.NoError(t, err)
		})
	}
}

func TestWriteToLogFile_WriteError(t *testing.T) {
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "closed.log")

	f, err := os.Create(logFile)
	require.NoError(t, err)
	f.Close() // Close immediately to cause write error

	err = WriteToLogFile(f, "info", "This should fail")
	assert.Error(t, err)
}
