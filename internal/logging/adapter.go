package logging

import (
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"gopkg.in/natefinch/lumberjack.v2"

	"github.com/sirupsen/logrus"
	"github.com/snyk/snyk-api-import/internal"
)

// Interface is the minimal logging interface used by the adapter.
// Keep it intentionally small to make it easy to implement test fakes
// or to adapt framework loggers later.
type Interface interface {
	Debugf(format string, args ...interface{})
	Infof(format string, args ...interface{})
	Warnf(format string, args ...interface{})
	Errorf(format string, args ...interface{})
}

// stdAdapter forwards logging to the existing package-level internal.Logger
// so existing behavior is preserved until callers migrate to this package.
type stdAdapter struct{}

func (stdAdapter) Debugf(format string, args ...interface{}) { internal.Logger.Debugf(format, args...) }
func (stdAdapter) Infof(format string, args ...interface{})  { internal.Logger.Infof(format, args...) }
func (stdAdapter) Warnf(format string, args ...interface{})  { internal.Logger.Warnf(format, args...) }
func (stdAdapter) Errorf(format string, args ...interface{}) { internal.Logger.Errorf(format, args...) }

var logger Interface = stdAdapter{}

// SetLogger replaces the package logger and returns a restore function.
// Tests can use this to inject a fake logger and then restore the original.
func SetLogger(l Interface) (restore func()) {
	old := logger
	logger = l
	return func() { logger = old }
}

// Convenience wrappers used by callers that will import this package.
func Debugf(format string, args ...interface{}) { logger.Debugf(format, args...) }
func Infof(format string, args ...interface{})  { logger.Infof(format, args...) }
func Warnf(format string, args ...interface{})  { logger.Warnf(format, args...) }
func Errorf(format string, args ...interface{}) { logger.Errorf(format, args...) }

// ValidationErrorf logs validation errors. In test mode, these are logged as
// info messages with a clear prefix since they're often expected test scenarios.
// In production, they're logged as errors.
func ValidationErrorf(format string, args ...interface{}) {
	if isTestMode() {
		logger.Infof("[validation-expected] "+format, args...)
	} else {
		logger.Errorf(format, args...)
	}
}

// isTestMode checks if we're running in test mode
func isTestMode() bool {
	// Check if running under 'go test' - the first arg is usually the test binary
	// Use more specific checks to avoid false positives (e.g., binary named 'contest-app')
	if len(os.Args) > 0 {
		firstArg := os.Args[0]
		// Check for .test suffix (compiled test binary) or exact match patterns
		if strings.HasSuffix(firstArg, ".test") ||
			strings.HasSuffix(firstArg, "/go-build") ||
			strings.Contains(firstArg, "/_test/") {
			return true
		}
	}

	// Check the call stack for test functions
	// This catches cases where tests manually set os.Args
	for i := 1; i < 10; i++ {
		pc, file, _, ok := runtime.Caller(i)
		if !ok {
			break
		}
		fn := runtime.FuncForPC(pc)
		if fn != nil {
			name := fn.Name()
			// Check if we're called from a test function or test file
			if strings.Contains(name, "_test.") || strings.Contains(name, ".Test") ||
				strings.HasSuffix(file, "_test.go") {
				return true
			}
		}
	}

	// Also check for explicit test env var
	return os.Getenv("SNYK_TEST_MODE") != ""
}

// ConfigureFromAppConfig configures the underlying package logger using values
// from AppConfig. Currently this supports writing logs to a file under
// AppConfig.SnykLogPath. If SnykLogPath is empty, no file is created and the
// existing logger output is left unchanged.
func ConfigureFromAppConfig(cfg internal.AppConfig) error {
	if cfg.SnykLogPath == "" {
		return nil
	}
	// Ensure the directory exists with secure permissions.
	if err := os.MkdirAll(cfg.SnykLogPath, 0700); err != nil {
		return err
	}
	fpath := filepath.Join(cfg.SnykLogPath, "snyk-api-import.log")

	// If rotation is configured (or defaults), use a rotating writer. This
	// avoids relying on manual file handling and supports size-based rotation.
	rot := &lumberjack.Logger{
		Filename:   fpath,
		MaxSize:    cfg.LogMaxSizeMB,  // megabytes
		MaxBackups: cfg.LogMaxBackups, // number of backups
		MaxAge:     cfg.LogMaxAgeDays, // days
		Compress:   cfg.LogCompress,   // disabled by default
	}

	// Set log level if provided
	if cfg.LogLevel != "" {
		internal.Logger.SetLevel(logLevelToLogrusLevel(cfg.LogLevel))
	}

	// internal.Logger is a *logrus.Logger so SetOutput accepts an io.Writer.
	internal.Logger.SetOutput(io.MultiWriter(os.Stderr, rot))
	return nil
}

// helper to convert string level to logrus.Level while avoiding an import cycle
func logLevelToLogrusLevel(level string) logrus.Level {
	switch strings.ToLower(level) {
	case "debug":
		return logrus.DebugLevel
	case "warn", "warning":
		return logrus.WarnLevel
	case "error":
		return logrus.ErrorLevel
	case "info":
		return logrus.InfoLevel
	default:
		return logrus.InfoLevel
	}
}
