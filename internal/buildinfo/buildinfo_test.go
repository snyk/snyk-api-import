package buildinfo

import "testing"

func TestUserAgent(t *testing.T) {
	t.Parallel()
	if got := UserAgent(); got != "snyk-api-import/dev" {
		t.Fatalf("with default Version, UserAgent() = %q, want snyk-api-import/dev", got)
	}
}
