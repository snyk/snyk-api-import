package network

import (
	"net/http"

	"github.com/sam1el/snyk-api-import-go/internal/security"
)

// Client is a minimal interface used by callers that need to perform HTTP
// requests. It mirrors the method used by http.Client to make testing easier.
type Client interface {
	Do(req *http.Request) (*http.Response, error)
}

type clientImpl struct {
	c *security.Client
}

func (ci *clientImpl) Do(req *http.Request) (*http.Response, error) {
	return ci.c.Do(req)
}

// Note: we intentionally do not expose the underlying *http.Client here to
// avoid reaching into the internal security.Client implementation. If callers
// need transport-level access, we can add a controlled accessor to security
// later.

// newFactory creates clientImpl instances. Tests may override this to
// inject an alternate implementation (httptest) for deterministic tests.
var newFactory = func() Client {
	return &clientImpl{c: security.NewClient()}
}

// NewClient returns a Client that wraps the project's secure HTTP client.
// It is intentionally small to make swapping implementations easy in tests.
func NewClient() Client {
	return newFactory()
}

// SetTestClient sets a test client factory. It returns a restore function
// to reset the factory to its previous value. Use in tests to inject
// deterministic clients backed by httptest.Server.
func SetTestClient(factory func() Client) (restore func()) {
	prev := newFactory
	newFactory = factory
	return func() { newFactory = prev }
}
