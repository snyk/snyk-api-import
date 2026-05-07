package testutil

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// WriteJSONResponse writes a JSON response to the ResponseRecorder/ResponseWriter
// This is a common pattern in mock HTTP handlers
func WriteJSONResponse(t *testing.T, w http.ResponseWriter, statusCode int, data interface{}) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if data != nil {
		err := json.NewEncoder(w).Encode(data)
		require.NoError(t, err, "Failed to encode JSON response")
	}
}

// WriteErrorResponse writes an error JSON response
func WriteErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"message": message}) //nolint:errcheck // Test helper
}

// AssertJSONResponse asserts that the response contains the expected JSON
func AssertJSONResponse(t *testing.T, w *httptest.ResponseRecorder, expected interface{}) {
	t.Helper()

	assert.Equal(t, "application/json", w.Header().Get("Content-Type"), "Content-Type should be application/json")

	var actual interface{}
	err := json.NewDecoder(w.Body).Decode(&actual)
	require.NoError(t, err, "Failed to decode response body")

	assert.Equal(t, expected, actual, "Response body should match expected")
}

// AssertStatusCode asserts the HTTP status code
func AssertStatusCode(t *testing.T, w *httptest.ResponseRecorder, expected int) {
	t.Helper()
	assert.Equal(t, expected, w.Code, "HTTP status code should match")
}

// AssertAuthHeader asserts that the Authorization header is present and has the expected prefix
func AssertAuthHeader(t *testing.T, r *http.Request, expectedPrefix string) {
	t.Helper()
	authHeader := r.Header.Get("Authorization")
	assert.NotEmpty(t, authHeader, "Authorization header should be present")
	assert.Contains(t, authHeader, expectedPrefix, "Authorization header should have expected prefix")
}

// AssertBearerToken asserts that the Authorization header contains a Bearer token
func AssertBearerToken(t *testing.T, r *http.Request) {
	t.Helper()
	AssertAuthHeader(t, r, "Bearer ")
}

// AssertTokenAuth asserts that the Authorization header contains a Token
func AssertTokenAuth(t *testing.T, r *http.Request) {
	t.Helper()
	AssertAuthHeader(t, r, "Token ")
}

// AssertBasicAuth asserts that the Authorization header contains Basic auth
func AssertBasicAuth(t *testing.T, r *http.Request) {
	t.Helper()
	AssertAuthHeader(t, r, "Basic ")
}

// AssertMethod asserts the HTTP method
func AssertMethod(t *testing.T, r *http.Request, expected string) {
	t.Helper()
	assert.Equal(t, expected, r.Method, "HTTP method should match")
}

// AssertQueryParam asserts that a query parameter has the expected value
func AssertQueryParam(t *testing.T, r *http.Request, key, expected string) {
	t.Helper()
	actual := r.URL.Query().Get(key)
	assert.Equal(t, expected, actual, "Query parameter %s should match", key)
}

// AssertPathContains asserts that the URL path contains the expected substring
func AssertPathContains(t *testing.T, r *http.Request, expected string) {
	t.Helper()
	assert.Contains(t, r.URL.Path, expected, "URL path should contain expected substring")
}
