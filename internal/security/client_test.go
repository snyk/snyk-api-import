package security

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/snyk/snyk-api-import/internal/buildinfo"
)

// TestNewClient_WithTestHTTPClient verifies that SetTestHTTPClient can inject
// a custom *http.Client and that the Client.Do convenience wrappers set the
// expected headers. This is a deterministic, local test that does not hit
// external services.
func TestNewClient_WithTestHTTPClient(t *testing.T) {
	// Start a local httptest server that asserts the User-Agent header and
	// returns a simple 200 OK response.
	wantUA := buildinfo.UserAgent()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ua := r.Header.Get("User-Agent")
		if ua != wantUA {
			t.Fatalf("unexpected User-Agent: %s", ua)
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	// Create a plain http.Client that will talk to the test server.
	testClient := &http.Client{}
	// Install the test client factory and ensure we restore the original
	// factory after the test.
	restore := SetTestHTTPClient(testClient, nil)
	defer restore()

	// Allow skipping the strict host validation for this unit test (the
	// httptest server uses an IP/localhost host that IsSafeURL would reject).
	t.Setenv("SNYK_TEST_SKIP_URL_VALIDATION", "1")

	// Use the security.Client to perform a GET against the test server.
	c := NewClient()
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("client Get failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}
}
