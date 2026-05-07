// Package internal provides centralized rate limiting and retry logic
// for Snyk API calls.
package internal

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/snyk/snyk-api-import/internal/network"
)

// ----------------------------------------------------------------------------
// Rate Limiter
// ----------------------------------------------------------------------------

// RateLimiter provides centralized rate limiting for API calls.
type RateLimiter struct {
	limiter *rate.Limiter
}

// RateLimitConfig holds rate limiting configuration.
type RateLimitConfig struct {
	RequestsPerSecond float64 // Sustained rate (default: 2)
	BurstSize         int     // Max burst (default: 10)
}

// DefaultRateLimitConfig returns sensible defaults for Snyk API.
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		RequestsPerSecond: 2.0, // ~500ms between requests
		BurstSize:         10,  // Allow bursts up to 10
	}
}

var (
	snykRateLimiter   *RateLimiter
	snykRateLimiterMu sync.Mutex
)

// GetSnykRateLimiter returns the singleton rate limiter for Snyk API calls.
// Uses mutex for thread-safe lazy initialization and to coordinate with ResetSnykRateLimiter.
func GetSnykRateLimiter() *RateLimiter {
	snykRateLimiterMu.Lock()
	defer snykRateLimiterMu.Unlock()

	if snykRateLimiter == nil {
		cfg := DefaultRateLimitConfig()
		snykRateLimiter = NewRateLimiter(cfg)
	}
	return snykRateLimiter
}

// ResetSnykRateLimiter resets the singleton for testing purposes.
// This allows tests to use a fresh rate limiter with custom config.
func ResetSnykRateLimiter(cfg *RateLimitConfig) {
	snykRateLimiterMu.Lock()
	defer snykRateLimiterMu.Unlock()

	if cfg == nil {
		c := DefaultRateLimitConfig()
		cfg = &c
	}
	snykRateLimiter = NewRateLimiter(*cfg)
}

// NewRateLimiter creates a new rate limiter with the given config.
func NewRateLimiter(cfg RateLimitConfig) *RateLimiter {
	return &RateLimiter{
		limiter: rate.NewLimiter(rate.Limit(cfg.RequestsPerSecond), cfg.BurstSize),
	}
}

// Wait blocks until the rate limiter allows another request.
// Returns error if context is cancelled.
func (r *RateLimiter) Wait(ctx context.Context) error {
	return r.limiter.Wait(ctx)
}

// WaitN blocks until n tokens are available.
func (r *RateLimiter) WaitN(ctx context.Context, n int) error {
	return r.limiter.WaitN(ctx, n)
}

// ----------------------------------------------------------------------------
// Retry Configuration
// ----------------------------------------------------------------------------

// RetryConfig holds retry configuration.
type RetryConfig struct {
	MaxRetries     int           // Max retry attempts (default: 5)
	InitialBackoff time.Duration // Initial backoff (default: 1s)
	MaxBackoff     time.Duration // Max backoff (default: 30s)
	BackoffFactor  float64       // Backoff multiplier (default: 2.0)
}

// DefaultRetryConfig returns sensible defaults.
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries:     5,
		InitialBackoff: 1 * time.Second,
		MaxBackoff:     30 * time.Second,
		BackoffFactor:  2.0,
	}
}

// TestRetryConfig returns a fast retry config for testing.
func TestRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries:     2,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     50 * time.Millisecond,
		BackoffFactor:  2.0,
	}
}

var (
	defaultRetryConfig   = DefaultRetryConfig()
	defaultRetryConfigMu sync.Mutex
)

// SetDefaultRetryConfig overrides the default retry config.
// Use in tests to speed up retry-based tests.
// Returns a restore function to reset to original config.
func SetDefaultRetryConfig(cfg RetryConfig) func() {
	defaultRetryConfigMu.Lock()
	old := defaultRetryConfig
	defaultRetryConfig = cfg
	defaultRetryConfigMu.Unlock()
	return func() {
		defaultRetryConfigMu.Lock()
		defaultRetryConfig = old
		defaultRetryConfigMu.Unlock()
	}
}

// getDefaultRetryConfig returns the current default retry config.
func getDefaultRetryConfig() RetryConfig {
	defaultRetryConfigMu.Lock()
	defer defaultRetryConfigMu.Unlock()
	return defaultRetryConfig
}

// IsRetryableStatus returns true if the HTTP status code is retryable.
func IsRetryableStatus(statusCode int) bool {
	switch statusCode {
	case 408, // Request Timeout
		429, // Too Many Requests
		500, // Internal Server Error
		502, // Bad Gateway
		503, // Service Unavailable
		504: // Gateway Timeout
		return true
	default:
		return false
	}
}

// GetRetryAfter extracts Retry-After header value.
// Returns 0 if header is missing or invalid.
func GetRetryAfter(resp *http.Response) time.Duration {
	if resp == nil {
		return 0
	}
	retryAfter := resp.Header.Get("Retry-After")
	if retryAfter == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(retryAfter); err == nil {
		return time.Duration(seconds) * time.Second
	}
	return 0
}

// CalculateBackoff returns the backoff duration for the given attempt.
func CalculateBackoff(attempt int, cfg RetryConfig) time.Duration {
	backoff := float64(cfg.InitialBackoff)
	for i := 0; i < attempt; i++ {
		backoff *= cfg.BackoffFactor
	}
	if backoff > float64(cfg.MaxBackoff) {
		backoff = float64(cfg.MaxBackoff)
	}
	return time.Duration(backoff)
}

// ----------------------------------------------------------------------------
// HTTP Helper with Rate Limiting and Retry
// ----------------------------------------------------------------------------

// DoWithRetry performs an HTTP request with rate limiting and automatic retries.
// It handles 429 (rate limit) and 5xx (server error) responses.
func DoWithRetry(ctx context.Context, client network.Client, req *http.Request) (*http.Response, []byte, error) {
	return DoWithRetryConfig(ctx, client, req, getDefaultRetryConfig())
}

// DoWithRetryConfig performs an HTTP request with custom retry configuration.
func DoWithRetryConfig(ctx context.Context, client network.Client, req *http.Request, cfg RetryConfig) (*http.Response, []byte, error) {
	rateLimiter := GetSnykRateLimiter()

	var lastErr error
	var lastResp *http.Response
	var lastBody []byte

	// Store original body for retries
	var bodyBytes []byte
	if req.Body != nil {
		var err error
		bodyBytes, err = io.ReadAll(req.Body)
		if err != nil {
			return nil, nil, fmt.Errorf("read request body: %w", err)
		}
		req.Body.Close()
	}

	for attempt := 0; attempt <= cfg.MaxRetries; attempt++ {
		// Check context before proceeding
		if ctx.Err() != nil {
			return nil, nil, ctx.Err()
		}

		// Wait for rate limiter
		if err := rateLimiter.Wait(ctx); err != nil {
			return nil, nil, fmt.Errorf("rate limiter: %w", err)
		}

		// Create new request with fresh body for each attempt
		reqClone, err := http.NewRequestWithContext(ctx, req.Method, req.URL.String(), nil)
		if err != nil {
			return nil, nil, fmt.Errorf("clone request: %w", err)
		}

		// Copy headers
		for k, v := range req.Header {
			reqClone.Header[k] = v
		}

		// Set body if present
		if bodyBytes != nil {
			reqClone.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			reqClone.ContentLength = int64(len(bodyBytes))
		}

		// Execute request
		resp, err := client.Do(reqClone)
		if err != nil {
			lastErr = err
			Logger.Debugf("Request failed (attempt %d/%d): %v", attempt+1, cfg.MaxRetries+1, err)
			if attempt < cfg.MaxRetries {
				time.Sleep(CalculateBackoff(attempt, cfg))
			}
			continue
		}

		// Read body
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("read response: %w", err)
			if attempt < cfg.MaxRetries {
				time.Sleep(CalculateBackoff(attempt, cfg))
			}
			continue
		}

		lastResp = resp
		lastBody = body

		// Success (2xx)
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return resp, body, nil
		}

		// Handle rate limiting (429)
		if resp.StatusCode == 429 {
			retryAfter := GetRetryAfter(resp)
			if retryAfter == 0 {
				retryAfter = CalculateBackoff(attempt, cfg)
			}
			Logger.Infof("Rate limited (429), waiting %v (attempt %d/%d)", retryAfter, attempt+1, cfg.MaxRetries+1)
			if attempt < cfg.MaxRetries {
				time.Sleep(retryAfter)
			}
			continue
		}

		// Handle retryable server errors (5xx)
		if IsRetryableStatus(resp.StatusCode) {
			Logger.Infof("Server error (%d), retrying (attempt %d/%d)", resp.StatusCode, attempt+1, cfg.MaxRetries+1)
			if attempt < cfg.MaxRetries {
				time.Sleep(CalculateBackoff(attempt, cfg))
			}
			continue
		}

		// Non-retryable status - return as-is (caller handles 4xx errors)
		return resp, body, nil
	}

	// Max retries exceeded
	if lastErr != nil {
		return lastResp, lastBody, fmt.Errorf("max retries exceeded: %w", lastErr)
	}
	if lastResp != nil {
		return lastResp, lastBody, fmt.Errorf("max retries exceeded: status %d", lastResp.StatusCode)
	}
	return nil, nil, fmt.Errorf("max retries exceeded")
}
