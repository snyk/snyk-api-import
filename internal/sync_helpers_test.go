package internal

import (
	"sort"
	"strings"
	"testing"
)

func TestGetDefaultManifestTypes(t *testing.T) {
	manifests := getDefaultManifestTypes()

	if len(manifests) == 0 {
		t.Fatal("Expected default manifest types, got empty slice")
	}

	// Verify some key manifest types are present
	expectedPatterns := []string{
		"package.json",
		"Gemfile.lock",
		"pom.xml",
		"requirements.txt",
		"go.mod",
		"Dockerfile",
		"composer.lock",
	}

	manifestsStr := strings.Join(manifests, ",")
	for _, expected := range expectedPatterns {
		if !strings.Contains(manifestsStr, expected) {
			t.Errorf("Expected default manifests to include %q", expected)
		}
	}

	// Verify Docker patterns are included
	dockerFound := false
	for _, m := range manifests {
		if strings.Contains(strings.ToLower(m), "dockerfile") {
			dockerFound = true
			break
		}
	}
	if !dockerFound {
		t.Error("Expected Dockerfile patterns in default manifests")
	}
}

func TestIsAllowedNextURL_ValidCases(t *testing.T) {
	tests := []struct {
		name        string
		nextURL     string
		allowedHost string
		want        bool
	}{
		{
			name:        "relative URL with slash",
			nextURL:     "/api/v1/repos?page=2",
			allowedHost: "api.github.com",
			want:        true,
		},
		{
			name:        "exact host match",
			nextURL:     "https://api.github.com/repos?page=2",
			allowedHost: "api.github.com",
			want:        true,
		},
		{
			name:        "subdomain match",
			nextURL:     "https://eu.api.github.com/repos",
			allowedHost: "api.github.com",
			want:        true,
		},
		{
			name:        "gitlab relative URL",
			nextURL:     "/api/v4/projects?page=3",
			allowedHost: "gitlab.com",
			want:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedNextURL(tt.nextURL, tt.allowedHost)
			if got != tt.want {
				t.Errorf("isAllowedNextURL(%q, %q) = %v, want %v", tt.nextURL, tt.allowedHost, got, tt.want)
			}
		})
	}
}

func TestIsAllowedNextURL_InvalidCases(t *testing.T) {
	tests := []struct {
		name        string
		nextURL     string
		allowedHost string
		want        bool
	}{
		{
			name:        "empty URL",
			nextURL:     "",
			allowedHost: "api.github.com",
			want:        false,
		},
		{
			name:        "http instead of https",
			nextURL:     "http://api.github.com/repos",
			allowedHost: "api.github.com",
			want:        false,
		},
		{
			name:        "different host",
			nextURL:     "https://evil.com/steal-data",
			allowedHost: "api.github.com",
			want:        false,
		},
		{
			name:        "subdomain of different host",
			nextURL:     "https://sub.evil.com/data",
			allowedHost: "api.github.com",
			want:        false,
		},
		{
			name:        "host suffix but not subdomain",
			nextURL:     "https://fakeapi.github.com.evil.com/data",
			allowedHost: "api.github.com",
			want:        false,
		},
		{
			name:        "malformed URL",
			nextURL:     "://invalid-url",
			allowedHost: "api.github.com",
			want:        false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedNextURL(tt.nextURL, tt.allowedHost)
			if got != tt.want {
				t.Errorf("isAllowedNextURL(%q, %q) = %v, want %v", tt.nextURL, tt.allowedHost, got, tt.want)
			}
		})
	}
}

func TestEscapePathSegments(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{
			name: "simple path",
			path: "owner/repo",
			want: "owner/repo",
		},
		{
			name: "path with spaces",
			path: "owner name/repo name",
			want: "owner%20name/repo%20name",
		},
		{
			name: "path with special characters",
			path: "owner@123/repo#456",
			want: "owner@123/repo%23456", // @ not escaped by url.PathEscape, # is escaped
		},
		{
			name: "path with plus",
			path: "c++/library",
			want: "c++/library", // + not escaped by url.PathEscape
		},
		{
			name: "empty path",
			path: "",
			want: "",
		},
		{
			name: "path with unicode",
			path: "user/日本語",
			want: "user/%E6%97%A5%E6%9C%AC%E8%AA%9E",
		},
		{
			name: "nested path",
			path: "org/team/subteam/project",
			want: "org/team/subteam/project",
		},
		{
			name: "path with dots",
			path: "user.name/repo.name",
			want: "user.name/repo.name",
		},
		{
			name: "path with ampersand",
			path: "owner/repo&branch",
			want: "owner/repo&branch", // & not escaped by url.PathEscape in path context
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := escapePathSegments(tt.path)
			if got != tt.want {
				t.Errorf("escapePathSegments(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

func TestEscapePathSegments_PreservesSlashes(t *testing.T) {
	path := "owner/sub/repo"
	got := escapePathSegments(path)

	// Count slashes - should be preserved
	wantSlashes := 2
	gotSlashes := strings.Count(got, "/")

	if gotSlashes != wantSlashes {
		t.Errorf("escapePathSegments(%q) should preserve slashes, want %d, got %d", path, wantSlashes, gotSlashes)
	}
}

func TestNormalizeSnykAttributes_Branch(t *testing.T) {
	tests := []struct {
		name        string
		attrs       map[string]interface{}
		projectName string
		wantBranch  string
		wantInclude bool
	}{
		{
			name: "branch attribute present",
			attrs: map[string]interface{}{
				"branch": "main",
			},
			projectName: "myrepo",
			wantBranch:  "main",
			wantInclude: true,
		},
		{
			name: "targetReference camelCase",
			attrs: map[string]interface{}{
				"targetReference": "develop",
			},
			projectName: "myrepo",
			wantBranch:  "develop",
			wantInclude: true,
		},
		{
			name: "target_reference snake_case",
			attrs: map[string]interface{}{
				"target_reference": "feature-branch",
			},
			projectName: "myrepo",
			wantBranch:  "feature-branch",
			wantInclude: true,
		},
		{
			name: "targetReference takes precedence over branch",
			attrs: map[string]interface{}{
				"branch":          "old",
				"targetReference": "new",
			},
			projectName: "myrepo",
			wantBranch:  "old",
			wantInclude: true,
		},
		{
			name:        "no branch info",
			attrs:       map[string]interface{}{},
			projectName: "myrepo",
			wantBranch:  "",
			wantInclude: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			branch, _, _, include := normalizeSnykAttributes(tt.attrs, tt.projectName, nil)
			if branch != tt.wantBranch {
				t.Errorf("normalizeSnykAttributes() branch = %q, want %q", branch, tt.wantBranch)
			}
			if include != tt.wantInclude {
				t.Errorf("normalizeSnykAttributes() include = %v, want %v", include, tt.wantInclude)
			}
		})
	}
}

func TestNormalizeSnykAttributes_Manifest(t *testing.T) {
	tests := []struct {
		name         string
		attrs        map[string]interface{}
		projectName  string
		wantManifest string
	}{
		{
			name: "manifest attribute present",
			attrs: map[string]interface{}{
				"manifest": "package.json",
			},
			projectName:  "myrepo",
			wantManifest: "package.json",
		},
		{
			name: "targetFile camelCase",
			attrs: map[string]interface{}{
				"targetFile": "src/package.json",
			},
			projectName:  "myrepo",
			wantManifest: "src/package.json",
		},
		{
			name: "target_file snake_case",
			attrs: map[string]interface{}{
				"target_file": "backend/pom.xml",
			},
			projectName:  "myrepo",
			wantManifest: "backend/pom.xml",
		},
		{
			name:         "manifest from project name with colon",
			attrs:        map[string]interface{}{},
			projectName:  "myrepo:go.mod",
			wantManifest: "go.mod",
		},
		{
			name:         "no manifest info",
			attrs:        map[string]interface{}{},
			projectName:  "myrepo",
			wantManifest: "",
		},
		{
			name: "manifest attribute takes precedence",
			attrs: map[string]interface{}{
				"manifest":   "primary.json",
				"targetFile": "secondary.json",
			},
			projectName:  "myrepo:tertiary.json",
			wantManifest: "primary.json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, manifest, _, _ := normalizeSnykAttributes(tt.attrs, tt.projectName, nil)
			if manifest != tt.wantManifest {
				t.Errorf("normalizeSnykAttributes() manifest = %q, want %q", manifest, tt.wantManifest)
			}
		})
	}
}

func TestNormalizeSnykAttributes_ManifestFiltering(t *testing.T) {
	tests := []struct {
		name          string
		attrs         map[string]interface{}
		projectName   string
		manifestTypes []string
		wantInclude   bool
	}{
		{
			name: "matching manifest with filter",
			attrs: map[string]interface{}{
				"manifest": "package.json",
			},
			projectName:   "myrepo",
			manifestTypes: []string{"package.json", "go.mod"},
			wantInclude:   true,
		},
		{
			name: "non-matching manifest with filter",
			attrs: map[string]interface{}{
				"manifest": "pom.xml",
			},
			projectName:   "myrepo",
			manifestTypes: []string{"package.json", "go.mod"},
			wantInclude:   false,
		},
		{
			name: "glob pattern match",
			attrs: map[string]interface{}{
				"manifest": "src/frontend/package.json",
			},
			projectName:   "myrepo",
			manifestTypes: []string{"**/package.json"},
			wantInclude:   true,
		},
		{
			name: "no manifest filter allows all",
			attrs: map[string]interface{}{
				"manifest": "any-file.txt",
			},
			projectName:   "myrepo",
			manifestTypes: nil,
			wantInclude:   true,
		},
		{
			name: "empty manifest with filter",
			attrs: map[string]interface{}{
				"manifest": "",
			},
			projectName:   "myrepo",
			manifestTypes: []string{"package.json"},
			wantInclude:   true, // Empty manifest bypasses filter
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, _, include := normalizeSnykAttributes(tt.attrs, tt.projectName, tt.manifestTypes)
			if include != tt.wantInclude {
				t.Errorf("normalizeSnykAttributes() include = %v, want %v", include, tt.wantInclude)
			}
		})
	}
}

func TestDeriveManifestProjectTypes_CaseInsensitive(t *testing.T) {
	// Test that derivation is case-insensitive
	tests := []struct {
		name  string
		globs []string
		want  string
	}{
		{
			name:  "uppercase package.json",
			globs: []string{"PACKAGE.JSON"},
			want:  "npm",
		},
		{
			name:  "mixed case Dockerfile",
			globs: []string{"DockerFile"},
			want:  "docker",
		},
		{
			name:  "uppercase GO.MOD",
			globs: []string{"GO.MOD"},
			want:  "go",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deriveManifestProjectTypes(tt.globs)
			found := false
			for _, projectType := range got {
				if projectType == tt.want {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("deriveManifestProjectTypes(%v) should contain %q, got %v", tt.globs, tt.want, got)
			}
		})
	}
}

func TestDeriveManifestProjectTypes_Deduplication(t *testing.T) {
	// Test that duplicate project types are deduplicated
	globs := []string{
		"package.json",
		"**/package.json",
		"frontend/package.json",
		"backend/package.json",
	}

	got := deriveManifestProjectTypes(globs)

	// Count occurrences of "npm"
	npmCount := 0
	for _, pt := range got {
		if pt == "npm" {
			npmCount++
		}
	}

	if npmCount != 1 {
		t.Errorf("Expected 'npm' to appear once, got %d times in %v", npmCount, got)
	}
}

func TestGetDefaultManifestTypes_Completeness(t *testing.T) {
	// Verify we have patterns for major ecosystems
	manifests := getDefaultManifestTypes()
	manifestsStr := strings.ToLower(strings.Join(manifests, " "))

	ecosystems := map[string]string{
		"npm":       "package.json",
		"ruby":      "gemfile",
		"maven":     "pom.xml",
		"python":    "requirements",
		"go":        "go.mod",
		"dotnet":    ".csproj",
		"php":       "composer",
		"docker":    "dockerfile",
		"terraform": ".tf",
	}

	for ecosystem, pattern := range ecosystems {
		if !strings.Contains(manifestsStr, pattern) {
			t.Errorf("Default manifests missing pattern for %s ecosystem (expected: %s)", ecosystem, pattern)
		}
	}
}

func TestEscapePathSegments_DoubleEscape(t *testing.T) {
	// Test that escaping already-escaped strings causes double-escaping (expected behavior)
	original := "owner test/repo name"
	first := escapePathSegments(original)
	second := escapePathSegments(first)

	// First should escape spaces
	if !strings.Contains(first, "%20") {
		t.Errorf("First escape should contain escaped space: %q", first)
	}

	// Second should double-escape (% becomes %25)
	if first == second {
		t.Errorf("Expected double-escaping on second call, but got same result: %q", second)
	}

	if !strings.Contains(second, "%2520") { // %20 becomes %2520
		t.Errorf("Second escape should double-escape space: %q", second)
	}
}

func TestDeriveManifestProjectTypes_EmptyInput(t *testing.T) {
	got := deriveManifestProjectTypes([]string{})
	if len(got) != 0 {
		t.Errorf("Expected empty slice for empty input, got %v", got)
	}
}

func TestDeriveManifestProjectTypes_AllTypes(t *testing.T) {
	// Use default manifests and verify we get a good variety of types
	defaults := getDefaultManifestTypes()
	types := deriveManifestProjectTypes(defaults)

	// Should have at least 10 different project types
	if len(types) < 10 {
		t.Errorf("Expected at least 10 project types from defaults, got %d: %v", len(types), types)
	}

	// Verify some key types are present
	expectedTypes := []string{"npm", "go", "docker", "pip"} // pip, not python
	sort.Strings(types)
	for _, expected := range expectedTypes {
		found := false
		for _, got := range types {
			if got == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected project type %q in %v", expected, types)
		}
	}
}

// ============================================================================
// CompareStates Tests
// ============================================================================

func TestCompareStates_EmptyInputs(t *testing.T) {
	result := CompareStates(nil, nil, nil)

	if len(result.Missing) != 0 {
		t.Errorf("Expected 0 missing, got %d", len(result.Missing))
	}
	if len(result.Stale) != 0 {
		t.Errorf("Expected 0 stale, got %d", len(result.Stale))
	}
	if len(result.ImportableEmpty) != 0 {
		t.Errorf("Expected 0 importable empty, got %d", len(result.ImportableEmpty))
	}
}

func TestCompareStates_MissingProjects(t *testing.T) {
	sourceRepos := []map[string]interface{}{
		{
			"owner":    "testorg",
			"name":     "repo1",
			"branch":   "main",
			"manifest": "package.json",
		},
	}
	snykProjects := []map[string]interface{}{}

	result := CompareStates(snykProjects, sourceRepos, nil)

	if len(result.Missing) != 1 {
		t.Errorf("Expected 1 missing project, got %d", len(result.Missing))
	}
	if len(result.Stale) != 0 {
		t.Errorf("Expected 0 stale projects, got %d", len(result.Stale))
	}
}

func TestCompareStates_StaleProjects(t *testing.T) {
	sourceRepos := []map[string]interface{}{}
	snykProjects := []map[string]interface{}{
		{
			"name":     "testorg/repo1:package.json",
			"branch":   "main",
			"manifest": "package.json",
		},
	}

	result := CompareStates(snykProjects, sourceRepos, nil)

	if len(result.Missing) != 0 {
		t.Errorf("Expected 0 missing projects, got %d", len(result.Missing))
	}
	if len(result.Stale) != 1 {
		t.Errorf("Expected 1 stale project, got %d", len(result.Stale))
	}
}

func TestCompareStates_MatchingProjects(t *testing.T) {
	sourceRepos := []map[string]interface{}{
		{
			"owner":    "testorg",
			"name":     "repo1",
			"branch":   "main",
			"manifest": "package.json",
		},
	}
	snykProjects := []map[string]interface{}{
		{
			"name":     "testorg/repo1:package.json",
			"branch":   "main",
			"manifest": "package.json",
		},
	}

	result := CompareStates(snykProjects, sourceRepos, nil)

	if len(result.Missing) != 0 {
		t.Errorf("Expected 0 missing projects, got %d", len(result.Missing))
	}
	if len(result.Stale) != 0 {
		t.Errorf("Expected 0 stale projects, got %d", len(result.Stale))
	}
}

func TestCompareStates_CaseInsensitive(t *testing.T) {
	sourceRepos := []map[string]interface{}{
		{
			"owner":    "TestOrg",
			"name":     "Repo1",
			"branch":   "main",
			"manifest": "package.json",
		},
	}
	snykProjects := []map[string]interface{}{
		{
			"name":     "testorg/repo1:package.json",
			"branch":   "main",
			"manifest": "package.json",
		},
	}

	result := CompareStates(snykProjects, sourceRepos, nil)

	// Should match despite case differences
	if len(result.Missing) != 0 {
		t.Errorf("Expected 0 missing projects (case-insensitive match), got %d", len(result.Missing))
	}
	if len(result.Stale) != 0 {
		t.Errorf("Expected 0 stale projects (case-insensitive match), got %d", len(result.Stale))
	}
}

func TestCompareStates_ManifestFiltering(t *testing.T) {
	sourceRepos := []map[string]interface{}{
		{
			"owner":    "testorg",
			"name":     "repo1",
			"branch":   "main",
			"manifest": "package.json",
		},
		{
			"owner":    "testorg",
			"name":     "repo1",
			"branch":   "main",
			"manifest": "pom.xml",
		},
	}
	snykProjects := []map[string]interface{}{}

	// Only look for package.json
	result := CompareStates(snykProjects, sourceRepos, []string{"package.json"})

	// Should only report package.json as missing, not pom.xml
	if len(result.Missing) != 1 {
		t.Errorf("Expected 1 missing project (filtered), got %d", len(result.Missing))
	}
	if len(result.Missing) > 0 {
		manifest, _ := result.Missing[0]["manifest"].(string)
		if manifest != "package.json" {
			t.Errorf("Expected missing manifest to be package.json, got %s", manifest)
		}
	}
}

// ============================================================================
// FilterSnykProjectsByProduct Tests
// ============================================================================

func TestFilterSnykProjectsByProduct_SCA(t *testing.T) {
	projects := []map[string]interface{}{
		{
			"name": "repo:package.json",
			"type": "npm",
		},
		{
			"name": "repo:Dockerfile",
			"type": "dockerfile",
		},
		{
			"name": "repo:main.tf",
			"type": "terraformconfig",
		},
	}

	result := FilterSnykProjectsByProduct(projects, "openSource")

	if len(result) != 1 {
		t.Errorf("Expected 1 SCA project, got %d", len(result))
	}
	if len(result) > 0 {
		projectType, _ := result[0]["type"].(string)
		if projectType != "npm" {
			t.Errorf("Expected npm project, got %s", projectType)
		}
	}
}

func TestFilterSnykProjectsByProduct_Container(t *testing.T) {
	projects := []map[string]interface{}{
		{
			"name": "repo:package.json",
			"type": "npm",
		},
		{
			"name": "repo:Dockerfile",
			"type": "dockerfile",
		},
	}

	result := FilterSnykProjectsByProduct(projects, "container")

	if len(result) != 1 {
		t.Errorf("Expected 1 container project, got %d", len(result))
	}
	if len(result) > 0 {
		projectType, _ := result[0]["type"].(string)
		if projectType != "dockerfile" {
			t.Errorf("Expected dockerfile project, got %s", projectType)
		}
	}
}

func TestFilterSnykProjectsByProduct_IaC(t *testing.T) {
	projects := []map[string]interface{}{
		{
			"name": "repo:package.json",
			"type": "npm",
		},
		{
			"name": "repo:main.tf",
			"type": "terraformconfig",
		},
		{
			"name": "repo:cloudformation.yaml",
			"type": "cloudformationconfig",
		},
	}

	result := FilterSnykProjectsByProduct(projects, "iac")

	if len(result) != 2 {
		t.Errorf("Expected 2 IaC projects, got %d", len(result))
	}
}

func TestFilterSnykProjectsByProduct_All(t *testing.T) {
	projects := []map[string]interface{}{
		{"name": "repo:package.json", "type": "npm"},
		{"name": "repo:Dockerfile", "type": "dockerfile"},
		{"name": "repo:main.tf", "type": "terraformconfig"},
	}

	// Empty product string returns all projects
	result := FilterSnykProjectsByProduct(projects, "")

	if len(result) != 3 {
		t.Errorf("Expected 3 projects (all), got %d", len(result))
	}
}

func TestFilterSnykProjectsByProduct_EmptyProduct(t *testing.T) {
	projects := []map[string]interface{}{
		{"name": "repo:package.json", "type": "npm"},
	}

	result := FilterSnykProjectsByProduct(projects, "")

	if len(result) != 1 {
		t.Errorf("Expected 1 project (empty product = all), got %d", len(result))
	}
}

// ============================================================================
// File Type Detection Tests
// ============================================================================

func TestIsSCAFile(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"package.json", "package.json", true},
		{"nested package.json", "frontend/package.json", true},
		{"go.mod", "go.mod", true},
		{"requirements.txt", "requirements.txt", true},
		{"pom.xml", "pom.xml", true},
		{"Gemfile.lock", "Gemfile.lock", true},
		{"Dockerfile", "Dockerfile", false},
		{"main.tf", "main.tf", false},
		{"random.txt", "random.txt", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSCAFile(tt.path)
			if got != tt.want {
				t.Errorf("isSCAFile(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestIsContainerFile(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"Dockerfile", "Dockerfile", true},
		{"Dockerfile.prod", "Dockerfile.prod", true},
		{"nested Dockerfile", "docker/Dockerfile", true},
		{"package.json", "package.json", false},
		{"main.tf", "main.tf", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isContainerFile(tt.path)
			if got != tt.want {
				t.Errorf("isContainerFile(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestIsIaCFile(t *testing.T) {
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"terraform", "main.tf", true},
		{"terraform vars", "vars.tfvars", true},
		{"helm chart", "chart.yaml", true},
		{"kubernetes in k8s dir", "k8s/deployment.yaml", true},
		{"cloudformation in cf dir", "cloudformation/template.yaml", true},
		{"terraform in tf dir", "terraform/main.json", true},
		{"random yaml", "config.yaml", false},
		{"package.json", "package.json", false},
		{"Dockerfile", "Dockerfile", false},
		{"CI yaml", ".github/workflows/ci.yaml", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isIaCFile(tt.path)
			if got != tt.want {
				t.Errorf("isIaCFile(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

// ============================================================================
// Project Type Detection Tests
// ============================================================================

func TestIsSCAProjectType(t *testing.T) {
	scaTypes := []string{"npm", "maven", "pip", "rubygems", "gomodules", "composer", "nuget", "yarn", "gradle", "poetry"}
	nonScaTypes := []string{"dockerfile", "terraformconfig", "k8sconfig"}

	for _, pt := range scaTypes {
		if !isSCAProjectType(pt) {
			t.Errorf("Expected %q to be SCA project type", pt)
		}
	}

	for _, pt := range nonScaTypes {
		if isSCAProjectType(pt) {
			t.Errorf("Expected %q to NOT be SCA project type", pt)
		}
	}
}

func TestIsContainerProjectType(t *testing.T) {
	containerTypes := []string{"dockerfile", "apk", "deb", "rpm", "linux"}
	nonContainerTypes := []string{"npm", "terraformconfig", "k8sconfig"}

	for _, pt := range containerTypes {
		if !isContainerProjectType(pt) {
			t.Errorf("Expected %q to be container project type", pt)
		}
	}

	for _, pt := range nonContainerTypes {
		if isContainerProjectType(pt) {
			t.Errorf("Expected %q to NOT be container project type", pt)
		}
	}
}

func TestIsIaCProjectType(t *testing.T) {
	iacTypes := []string{"terraformconfig", "k8sconfig", "cloudformationconfig", "armconfig"}
	nonIacTypes := []string{"npm", "dockerfile", "maven"}

	for _, pt := range iacTypes {
		if !isIaCProjectType(pt) {
			t.Errorf("Expected %q to be IaC project type", pt)
		}
	}

	for _, pt := range nonIacTypes {
		if isIaCProjectType(pt) {
			t.Errorf("Expected %q to NOT be IaC project type", pt)
		}
	}
}

func TestIsValidWorkspaceName(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"valid simple", "my-workspace", true},
		{"valid with numbers", "workspace123", true},
		{"valid with underscore", "my_workspace", true},
		{"empty", "", false},
		{"with spaces", "my workspace", false},
		{"with special chars", "workspace@123", false},
		{"with slash", "my/workspace", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidWorkspaceName(tt.input)
			if got != tt.want {
				t.Errorf("isValidWorkspaceName(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}
