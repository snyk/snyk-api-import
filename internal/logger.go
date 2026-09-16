package internal

import (
	"fmt"
	"os"

	"github.com/sirupsen/logrus"
)

// Logger is the package-level logger used by internal packages.
var Logger *logrus.Logger

func init() {
	l := logrus.New()
	// Use text formatter for readability in CLI and CI
	l.SetFormatter(&logrus.TextFormatter{FullTimestamp: true, ForceColors: true})
	// Default level is Info; allow debug via env var SNYK_DEBUG or SNYK_VERBOSE
	if os.Getenv("SNYK_DEBUG") != "" || os.Getenv("SNYK_VERBOSE") != "" || os.Getenv("DEBUG") != "" {
		l.SetLevel(logrus.DebugLevel)
	} else {
		l.SetLevel(logrus.InfoLevel)
	}
	Logger = l
}

// SetDebug enables debug logging at runtime.
func SetDebug(enabled bool) {
	if enabled {
		Logger.SetLevel(logrus.DebugLevel)
	}
}

// WriteToLogFile writes a formatted message to the provided file and also logs
// the same message through the package logger at the requested level.
// level should be one of: "debug", "info", "warn", "error". If an
// unknown level is provided, it defaults to info.
func WriteToLogFile(f *os.File, level string, format string, args ...interface{}) error {
	if f != nil {
		if _, err := fmt.Fprintf(f, format, args...); err != nil {
			// If writing to file fails, still log the error
			Logger.Errorf("failed to write to log file: %v", err)
			return err
		}
	}
	switch level {
	case "debug":
		Logger.Debugf(format, args...)
	case "warn", "warning":
		Logger.Warnf(format, args...)
	case "error":
		Logger.Errorf(format, args...)
	default:
		Logger.Infof(format, args...)
	}
	return nil
}
