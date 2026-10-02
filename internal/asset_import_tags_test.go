package internal

import "testing"

func TestValidTagKey(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{"default destination org key", DestinationOrgTagKey, true},
		{"auto-imported key", AutoImportedTagKey, true},
		{"gitlab project id key", GitLabProjectIDTagKey, true},
		{"simple alnum", "application", true},
		{"hyphen and underscore", "app-id_2", true},
		{"empty", "", false},
		{"has space", "has space", false},
		{"has dot", "has.dot", false},
		{"exactly max length", stringOfLen(MaxTagKeyLength, 'a'), true},
		{"over max length", stringOfLen(MaxTagKeyLength+1, 'a'), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidTagKey(tt.in); got != tt.want {
				t.Errorf("ValidTagKey(%q) = %v; want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestValidTagValue(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{"exclude sentinel", ExcludeTagValue, true},
		{"simple name", "checkout", true},
		{"with symbols", "checkout-v2/prod", true},
		{"empty", "", false},
		{"has space", "has space", false},
		{"has dot", "has.dot", false},
		{"exactly max length", stringOfLen(MaxTagValueLength, 'a'), true},
		{"over max length", stringOfLen(MaxTagValueLength+1, 'a'), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidTagValue(tt.in); got != tt.want {
				t.Errorf("ValidTagValue(%q) = %v; want %v", tt.in, got, tt.want)
			}
		})
	}
}

func stringOfLen(n int, r rune) string {
	b := make([]rune, n)
	for i := range b {
		b[i] = r
	}
	return string(b)
}
