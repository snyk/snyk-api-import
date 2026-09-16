package internal

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ----------------------------------------------------------------------------
// RateLimiter Tests
// ----------------------------------------------------------------------------

func TestNewRateLimiter(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 10,
		BurstSize:         5,
	}
	limiter := NewRateLimiter(cfg)
	assert.NotNil(t, limiter)
	assert.NotNil(t, limiter.limiter)
}

func TestDefaultRateLimitConfig(t *testing.T) {
	cfg := DefaultRateLimitConfig()
	assert.Equal(t, 2.0, cfg.RequestsPerSecond)
	assert.Equal(t, 10, cfg.BurstSize)
}

func TestRateLimiter_Wait(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 100, // Fast for testing
		BurstSize:         2,
	}
	limiter := NewRateLimiter(cfg)

	ctx := context.Background()
	start := time.Now()

	// First 2 should be instant (burst)
	require.NoError(t, limiter.Wait(ctx))
	require.NoError(t, limiter.Wait(ctx))

	// Third should wait (~10ms at 100 req/sec)
	require.NoError(t, limiter.Wait(ctx))
	elapsed := time.Since(start)

	// Should have waited at least a little
	assert.True(t, elapsed >= 5*time.Millisecond, "expected some wait, got %v", elapsed)
}

func TestRateLimiter_WaitN(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 100,
		BurstSize:         5,
	}
	limiter := NewRateLimiter(cfg)

	ctx := context.Background()

	// Request 3 tokens at once
	require.NoError(t, limiter.WaitN(ctx, 3))

	// Should have 2 tokens left in burst
	require.NoError(t, limiter.WaitN(ctx, 2))
}

func TestRateLimiter_ContextCancelled(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 0.1, // Very slow
		BurstSize:         1,
	}
	limiter := NewRateLimiter(cfg)

	ctx, cancel := context.WithCancel(context.Background())

	// Use up the burst
	require.NoError(t, limiter.Wait(ctx))

	// Cancel before next wait completes
	cancel()

	err := limiter.Wait(ctx)
	assert.Error(t, err)
}

// ----------------------------------------------------------------------------
// RetryConfig Tests
// ----------------------------------------------------------------------------

func TestDefaultRetryConfig(t *testing.T) {
	cfg := DefaultRetryConfig()
	assert.Equal(t, 5, cfg.MaxRetries)
	assert.Equal(t, 1*time.Second, cfg.InitialBackoff)
	assert.Equal(t, 30*time.Second, cfg.MaxBackoff)
	assert.Equal(t, 2.0, cfg.BackoffFactor)
}

func TestIsRetryableStatus(t *testing.T) {
	tests := []struct {
		status   int
		expected bool
	}{
		{200, false},
		{201, false},
		{204, false},
		{400, false},
		{401, false},
		{403, false},
		{404, false},
		{405, false},
		{408, true},  // Request Timeout
		{422, false}, // Unprocessable Entity
		{429, true},  // Too Many Requests
		{500, true},  // Internal Server Error
		{502, true},  // Bad Gateway
		{503, true},  // Service Unavailable
		{504, true},  // Gateway Timeout
	}

	for _, tt := range tests {
		t.Run(http.StatusText(tt.status), func(t *testing.T) {
			assert.Equal(t, tt.expected, IsRetryableStatus(tt.status))
		})
	}
}

func TestGetRetryAfter(t *testing.T) {
	tests := []struct {
		name     string
		header   string
		expected time.Duration
	}{
		{"no header", "", 0},
		{"valid seconds", "5", 5 * time.Second},
		{"zero", "0", 0},
		{"invalid", "not-a-number", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := &http.Response{Header: http.Header{}}
			if tt.header != "" {
				resp.Header.Set("Retry-After", tt.header)
			}
			assert.Equal(t, tt.expected, GetRetryAfter(resp))
		})
	}

	// Test nil response
	assert.Equal(t, time.Duration(0), GetRetryAfter(nil))
}

func TestCalculateBackoff(t *testing.T) {
	cfg := RetryConfig{
		InitialBackoff: 1 * time.Second,
		MaxBackoff:     30 * time.Second,
		BackoffFactor:  2.0,
	}

	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{0, 1 * time.Second},
		{1, 2 * time.Second},
		{2, 4 * time.Second},
		{3, 8 * time.Second},
		{4, 16 * time.Second},
		{5, 30 * time.Second}, // Capped at max
		{6, 30 * time.Second}, // Still capped
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("attempt_%d", tt.attempt), func(t *testing.T) {
			assert.Equal(t, tt.expected, CalculateBackoff(tt.attempt, cfg))
		})
	}
}

// ----------------------------------------------------------------------------
// DoWithRetry Tests
// ----------------------------------------------------------------------------

// mockClient implements network.Client for testing
type mockClient struct {
	doFunc func(req *http.Request) (*http.Response, error)
}

func (m *mockClient) Do(req *http.Request) (*http.Response, error) {
	return m.doFunc(req)
}

func TestDoWithRetry_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "ok"}`))
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	req, _ := http.NewRequest("GET", server.URL, nil)
	cfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     100 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	resp, body, err := DoWithRetryConfig(context.Background(), client, req, cfg)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	assert.Equal(t, `{"status": "ok"}`, string(body))
}

func TestDoWithRetry_429WithRetryAfter(t *testing.T) {
	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&attempts, 1)
		if count == 1 {
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(429)
			w.Write([]byte(`{"error": "rate limited"}`))
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"status": "ok"}`))
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	req, _ := http.NewRequest("GET", server.URL, nil)
	cfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     100 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	resp, body, err := DoWithRetryConfig(context.Background(), client, req, cfg)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	assert.Equal(t, `{"status": "ok"}`, string(body))
	assert.Equal(t, int32(2), atomic.LoadInt32(&attempts))
}

func TestDoWithRetry_ServerError(t *testing.T) {
	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&attempts, 1)
		if count < 3 {
			w.WriteHeader(500)
			w.Write([]byte(`{"error": "server error"}`))
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"status": "ok"}`))
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	req, _ := http.NewRequest("GET", server.URL, nil)
	cfg := RetryConfig{
		MaxRetries:     5,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     100 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	resp, _, err := DoWithRetryConfig(context.Background(), client, req, cfg)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	assert.Equal(t, int32(3), atomic.LoadInt32(&attempts))
}

func TestDoWithRetry_MaxRetriesExceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		w.Write([]byte(`{"error": "server error"}`))
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	req, _ := http.NewRequest("GET", server.URL, nil)
	cfg := RetryConfig{
		MaxRetries:     2,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     50 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	_, _, err := DoWithRetryConfig(context.Background(), client, req, cfg)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "max retries exceeded")
}

func TestDoWithRetry_NonRetryable4xx(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		w.Write([]byte(`{"error": "not found"}`))
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	req, _ := http.NewRequest("GET", server.URL, nil)
	cfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     100 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	resp, body, err := DoWithRetryConfig(context.Background(), client, req, cfg)

	// 404 is not retryable, should return immediately without error
	require.NoError(t, err)
	assert.Equal(t, 404, resp.StatusCode)
	assert.Equal(t, `{"error": "not found"}`, string(body))
}

func TestDoWithRetry_WithBody(t *testing.T) {
	var receivedBodyMu sync.Mutex
	var receivedBody string
	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		receivedBodyMu.Lock()
		receivedBody = string(body)
		receivedBodyMu.Unlock()
		count := atomic.AddInt32(&attempts, 1)
		if count == 1 {
			w.WriteHeader(500)
			return
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"status": "ok"}`))
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	reqBody := `{"test": "data"}`
	req, _ := http.NewRequest("POST", server.URL, strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	cfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     100 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	resp, _, err := DoWithRetryConfig(context.Background(), client, req, cfg)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
	receivedBodyMu.Lock()
	bodyValue := receivedBody
	receivedBodyMu.Unlock()
	assert.Equal(t, reqBody, bodyValue) // Body should be preserved on retry
}

func TestDoWithRetry_ContextCancelled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(200)
	}))
	defer server.Close()

	client := &mockClient{
		doFunc: func(req *http.Request) (*http.Response, error) {
			return http.DefaultClient.Do(req)
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()

	req, _ := http.NewRequest("GET", server.URL, nil)
	cfg := RetryConfig{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     100 * time.Millisecond,
		BackoffFactor:  2.0,
	}

	_, _, err := DoWithRetryConfig(ctx, client, req, cfg)

	require.Error(t, err)
}

// ----------------------------------------------------------------------------
// Singleton Tests
// ----------------------------------------------------------------------------

func TestGetSnykRateLimiter_Singleton(t *testing.T) {
	// Note: This test may be flaky if run after other tests that call GetSnykRateLimiter
	// In production, the singleton is initialized once
	limiter1 := GetSnykRateLimiter()
	limiter2 := GetSnykRateLimiter()

	assert.Same(t, limiter1, limiter2, "GetSnykRateLimiter should return the same instance")
}
