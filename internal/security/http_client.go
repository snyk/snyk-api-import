package security

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/snyk/snyk-api-import/internal/buildinfo"
)

// appendDebugJSONLine appends a JSON line to path. This is a lightweight,
// local helper used to avoid importing internal/utils (which would create an
// import cycle). It's strictly for debug output when SNYK_DEBUG_REQUESTS=1.
func appendDebugJSONLine(path string, v interface{}) error {
	if path == "" {
		return nil
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer func() {
		_ = f.Close()
	}()
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if _, err := f.Write(append(b, '\n')); err != nil {
		return err
	}
	return nil
}

// Client is a secure HTTP client wrapper
type Client struct {
	client       *http.Client
	allowedHosts []string
}

// NewClient creates a new secure HTTP client
// newClientFactory is used to construct clients. Tests can override this to
// inject a test HTTP client (httptest.Server) without changing public APIs.
var (
	// clientFactoryMu protects newClientFactory from concurrent access.
	// This prevents data races when tests call SetTestHTTPClient concurrently.
	clientFactoryMu  sync.RWMutex
	newClientFactory = func(allowedHosts ...string) *Client {
		if len(allowedHosts) == 0 {
			allowedHosts = DefaultAllowedHosts
		}

		transport := &http.Transport{
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		}

		return &Client{
			client: &http.Client{
				Timeout:   30 * time.Second,
				Transport: transport,
			},
			allowedHosts: allowedHosts,
		}
	}
)

// NewClient returns a secure Client. Tests may override newClientFactory via
// SetTestHTTPClient to return a custom client for deterministic, httptest-based
// unit tests. By default this behaves exactly as before.
func NewClient(allowedHosts ...string) *Client {
	clientFactoryMu.RLock()
	factory := newClientFactory
	clientFactoryMu.RUnlock()
	return factory(allowedHosts...)
}

// SetTestHTTPClient installs a test HTTP client factory that will be used by
// NewClient. It returns a restore function that must be called in a defer to
// restore previous behavior. This is intended for tests only; it does not
// change default production behavior unless the test calls it.
func SetTestHTTPClient(c *http.Client, allowedHosts []string) (restore func()) {
	clientFactoryMu.Lock()
	prev := newClientFactory
	newClientFactory = func(_ ...string) *Client {
		ah := allowedHosts
		if len(ah) == 0 {
			ah = DefaultAllowedHosts
		}
		return &Client{client: c, allowedHosts: ah}
	}
	clientFactoryMu.Unlock()
	return func() {
		clientFactoryMu.Lock()
		newClientFactory = prev
		clientFactoryMu.Unlock()
	}
}

// SanitizeHeadersForLogging creates a copy of headers with sensitive values obfuscated
func SanitizeHeadersForLogging(headers http.Header) map[string][]string {
	sanitized := make(map[string][]string)
	for k, v := range headers {
		kLower := strings.ToLower(k)
		if kLower == "authorization" || kLower == "x-api-key" || kLower == "api-key" ||
			strings.Contains(kLower, "token") || strings.Contains(kLower, "secret") ||
			strings.Contains(kLower, "password") {
			// Obfuscate: show first 4 chars, then ***
			if len(v) > 0 && len(v[0]) > 4 {
				sanitized[k] = []string{v[0][:4] + "***REDACTED***"}
			} else {
				sanitized[k] = []string{"***REDACTED***"}
			}
		} else {
			sanitized[k] = v
		}
	}
	return sanitized
}

// Do sends an HTTP request and returns an HTTP response, following policy
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	// Validate the URL before making the request. Tests may set
	// SNYK_TEST_SKIP_URL_VALIDATION=1 to bypass host checks when using
	// httptest.Server (which often uses IP addresses) in unit tests. This is
	// a test-only escape hatch and is disabled by default in production.
	if os.Getenv("SNYK_TEST_SKIP_URL_VALIDATION") != "1" {
		if err := IsSafeURL(req.URL.String(), c.allowedHosts); err != nil {
			return nil, fmt.Errorf("unsafe URL: %w", err)
		}
	}

	// Set secure headers
	req.Header.Set("User-Agent", buildinfo.UserAgent())
	// Prefer JSON but do not overwrite an explicit Content-Type set by caller
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json")
	}
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	// Disable compression to prevent compression-based attacks
	req.Header.Set("Accept-Encoding", "identity")

	// Optional debug: print final outgoing request headers before sending
	debug := os.Getenv("SNYK_DEBUG_REQUESTS") == "1"
	logPath := os.Getenv("SNYK_LOG_PATH")
	if debug {
		sanitizedHeaders := SanitizeHeadersForLogging(req.Header)
		fmt.Printf("[SNYK_DEBUG_REQUESTS] Final outgoing request: %s %s\nHeaders: %v\n", req.Method, req.URL.String(), sanitizedHeaders)
		// If a log path is configured, persist the final request for later analysis
		if logPath != "" {
			_ = appendDebugJSONLine(fmt.Sprintf("%s/http.request-dump.log", logPath), map[string]interface{}{
				"type":    "final-request",
				"method":  req.Method,
				"url":     req.URL.String(),
				"headers": sanitizedHeaders,
			})
		}
	}

	// Make the request
	resp, err := c.client.Do(req)
	if debug {
		if err != nil {
			fmt.Printf("[SNYK_DEBUG_REQUESTS] Request error: %v\n", err)
			if logPath != "" {
				_ = appendDebugJSONLine(fmt.Sprintf("%s/http.request-dump.log", logPath), map[string]interface{}{
					"type":   "request-error",
					"method": req.Method,
					"url":    req.URL.String(),
					"error":  err.Error(),
				})
			}
		} else {
			sanitizedRespHeaders := SanitizeHeadersForLogging(resp.Header)
			fmt.Printf("[SNYK_DEBUG_REQUESTS] Response status: %s\nHeaders: %v\n", resp.Status, sanitizedRespHeaders)
			if logPath != "" {
				_ = appendDebugJSONLine(fmt.Sprintf("%s/http.request-dump.log", logPath), map[string]interface{}{
					"type":    "response",
					"method":  req.Method,
					"url":     req.URL.String(),
					"status":  resp.Status,
					"headers": sanitizedRespHeaders,
				})
			}
		}
	}
	return resp, err
}

// Get is a convenience method for GET requests
func (c *Client) Get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	return c.Do(req)
}

// Post is a convenience method for POST requests
func (c *Client) Post(ctx context.Context, url, contentType string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	return c.Do(req)
}
