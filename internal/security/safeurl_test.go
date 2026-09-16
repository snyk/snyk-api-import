package security

import "testing"

func TestIsSafeURL_EdgeCases(t *testing.T) {
	allowed := []string{"api.snyk.io", "api.bitbucket.org"}

	cases := []struct {
		url string
		ok  bool
	}{
		{"https://api.snyk.io/v1/projects", true},
		{"https://sub.api.snyk.io/path", true},
		{"http://api.snyk.io/", false},
		{"https://192.168.1.1/resource", false},
		{"https://[::1]/", false},
		{"https://api.snyk.io:443/", true},
		{"https://api.snyk.io:8443/", true},
		{"https://user:pass@api.snyk.io/", false},
		{"https://api.evil-example.com/", false},
		{"", false},
	}

	for _, c := range cases {
		err := IsSafeURL(c.url, allowed)
		if (err == nil) != c.ok {
			t.Fatalf("IsSafeURL(%q) = %v; want ok=%v", c.url, err, c.ok)
		}
	}
}
