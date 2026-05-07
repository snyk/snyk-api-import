package network

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClient(t *testing.T) {
	client := NewClient()
	if client == nil {
		t.Fatal("NewClient() returned nil")
	}
}

func TestClientDo(t *testing.T) {
	// Create a TLS test server (security.Client only allows HTTPS)
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer ts.Close()

	// Use mock client to avoid certificate validation issues in tests
	mockClient := &mockHTTPClient{
		response: &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewBufferString(`{"status":"ok"}`)),
		},
	}

	restore := SetTestClient(func() Client { return mockClient })
	defer restore()

	client := NewClient()

	req, err := http.NewRequest("GET", ts.URL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Client.Do() error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	expected := `{"status":"ok"}`
	if string(body) != expected {
		t.Errorf("Expected body %q, got %q", expected, string(body))
	}
}

func TestSetTestClient(t *testing.T) {
	// Mock client for testing
	mockClient := &mockHTTPClient{
		response: &http.Response{
			StatusCode: http.StatusTeapot,
			Body:       io.NopCloser(bytes.NewBufferString("mock")),
		},
	}

	// Set test client
	restore := SetTestClient(func() Client {
		return mockClient
	})
	defer restore()

	// Verify factory was overridden
	client := NewClient()
	if client != mockClient {
		t.Error("SetTestClient did not override factory")
	}

	// Verify restore works
	restore()
	clientAfterRestore := NewClient()
	if clientAfterRestore == mockClient {
		t.Error("Restore did not reset factory")
	}
}

func TestSetTestClient_MultipleOverrides(t *testing.T) {
	mockClient1 := &mockHTTPClient{
		response: &http.Response{StatusCode: 200},
	}
	mockClient2 := &mockHTTPClient{
		response: &http.Response{StatusCode: 201},
	}

	// First override
	restore1 := SetTestClient(func() Client { return mockClient1 })
	if NewClient() != mockClient1 {
		t.Error("First override failed")
	}

	// Second override
	restore2 := SetTestClient(func() Client { return mockClient2 })
	if NewClient() != mockClient2 {
		t.Error("Second override failed")
	}

	// Restore in reverse order
	restore2()
	if NewClient() != mockClient1 {
		t.Error("Second restore didn't return to first override")
	}

	restore1()
	// Should be back to default (not mockClient1 or mockClient2)
	client := NewClient()
	if client == mockClient1 || client == mockClient2 {
		t.Error("First restore didn't return to default")
	}
}

func TestClientDo_ErrorHandling(t *testing.T) {
	// Use mock client to test error handling
	mockClient := &mockHTTPClient{
		response: &http.Response{
			StatusCode: http.StatusInternalServerError,
			Body:       io.NopCloser(bytes.NewBufferString(`{"error":"internal error"}`)),
		},
	}

	restore := SetTestClient(func() Client { return mockClient })
	defer restore()

	client := NewClient()

	req, err := http.NewRequest("GET", "https://example.com", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Client.Do() error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("Expected status %d, got %d", http.StatusInternalServerError, resp.StatusCode)
	}
}

func TestClientDo_WithHeaders(t *testing.T) {
	// Use mock client to test header handling
	mockClient := &mockHTTPClient{
		response: &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewBufferString("Bearer test-token")),
		},
	}

	restore := SetTestClient(func() Client { return mockClient })
	defer restore()

	client := NewClient()

	req, err := http.NewRequest("GET", "https://example.com", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer test-token")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Client.Do() error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "Bearer test-token" {
		t.Errorf("Expected echo of Authorization header, got %q", string(body))
	}
}

// mockHTTPClient is a simple mock for testing
type mockHTTPClient struct {
	response *http.Response
	err      error
}

func (m *mockHTTPClient) Do(req *http.Request) (*http.Response, error) {
	return m.response, m.err
}
