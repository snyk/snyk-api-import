package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"path/filepath"
)

// AppendJSONLine marshals v to JSON and appends it as a single line to path.
// Uses security.SafeOpenFile for safe append semantics and secure permissions.
func AppendJSONLine(path string, v interface{}) error {
	if path == "" {
		return fmt.Errorf("empty path")
	}
	f, err := safeOpenAppend(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("open append file: %w", err)
	}
	defer func() { _ = f.Close() }()

	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("marshal json: %w", err)
	}
	if _, err := f.Write(append(b, '\n')); err != nil {
		return fmt.Errorf("write json line: %w", err)
	}
	return nil
}

// AppendBunyanJSONLine wraps payload (which may be a struct or map) into a
// Bunyan-like envelope and appends it as a single JSON line to path.
// Envelope fields: pid, hostname, level, time, msg, v. Payload fields are
// merged at top-level (same as Bunyan extra fields).
func AppendBunyanJSONLine(path string, level int, msg string, payload interface{}) error {
	if path == "" {
		return fmt.Errorf("empty path")
	}
	// Open file for append
	f, err := safeOpenAppend(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("open append file: %w", err)
	}
	defer func() { _ = f.Close() }()

	// Start with envelope
	env := make(map[string]interface{})
	env["pid"] = os.Getpid()
	if hn, err := os.Hostname(); err == nil {
		env["hostname"] = hn
	} else {
		env["hostname"] = ""
	}
	env["level"] = level
	env["time"] = timeNowUTC()
	env["msg"] = msg
	env["v"] = 0

	// Merge payload fields if payload is a map or struct
	if payload != nil {
		// Marshal then unmarshal into a map[string]interface{}
		b, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("marshal payload: %w", err)
		}
		var pm map[string]interface{}
		if err := json.Unmarshal(b, &pm); err == nil {
			for k, v := range pm {
				// don't overwrite envelope keys
				if _, exists := env[k]; !exists {
					env[k] = v
				}
			}
		} else {
			// if payload couldn't be interpreted as object, put it under "data"
			env["data"] = payload
		}
	}

	out, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}
	if _, err := f.Write(append(out, '\n')); err != nil {
		return fmt.Errorf("write json line: %w", err)
	}
	return nil
}

// safeOpenAppend creates parent directories when needed and opens the file
// for append with the provided flags and permissions. This is a small local
// helper to avoid importing the security package (which would create an
// import cycle for some consumers). It intentionally implements a subset of
// the checks performed by security.SafeOpenFile.
func safeOpenAppend(p string, flag int, perm os.FileMode) (*os.File, error) {
	if p == "" {
		return nil, fmt.Errorf("empty path")
	}
	// Ensure parent directory exists
	dir := filepath.Dir(p)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}
	f, err := os.OpenFile(p, flag, perm)
	if err != nil {
		return nil, fmt.Errorf("error opening file: %w", err)
	}
	return f, nil
}

// timeNowUTC returns the current time in RFC3339 format. Abstracted for tests.
func timeNowUTC() string {
	return time.Now().UTC().Format(time.RFC3339)
}
