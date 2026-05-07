# Test Data Fixtures

This directory contains test fixtures for all integrations and scenarios.

## Directory Structure

```tree
testdata/
├── github/               # GitHub API responses
│   ├── repos_success.json
│   ├── error_unauthorized.json
│   ├── error_not_found.json
│   └── error_rate_limit.json
│
├── gitlab/               # GitLab API responses
│   ├── projects_success.json
│   └── error_unauthorized.json
│
├── bitbucket-cloud/      # Bitbucket Cloud API responses
│   ├── repos_success.json
│   └── error_unauthorized.json
│
├── bitbucket-cloud-app/  # Bitbucket Cloud App OAuth responses
│   └── (future fixtures)
│
├── azure/                # Azure DevOps API responses
│   ├── repos_success.json
│   ├── projects_success.json
│   └── error_unauthorized.json
│
├── snyk/                 # Snyk API responses
│   ├── projects_success.json
│   ├── integrations_success.json
│   ├── error_unauthorized.json
│   └── error_org_not_found.json
│
├── manifests/            # Manifest discovery fixtures
│   ├── nodejs_project.json
│   ├── java_project.json
│   ├── python_project.json
│   └── infrastructure_project.json
│
└── sync/                 # Sync comparison fixtures
    ├── snyk_projects.json
    └── scm_repos.json
```

## Usage

### Option 1: Use helper functions (recommended)

```go
import "github.com/sam1el/snyk-api-import-go/internal/testdata"

func TestMyFunction(t *testing.T) {
    // Load raw JSON
    data := testdata.MustLoadFixture(testdata.GitHubReposSuccess)

    // Or load directly into a struct
    var repos []GitHubRepo
    testdata.MustLoadFixtureInto(testdata.GitHubReposSuccess, &repos)
}
```

### Option 2: Direct file loading

```go
import (
    "encoding/json"
    "os"
)

func TestMyFunction(t *testing.T) {
    data, err := os.ReadFile("testdata/github/repos_success.json")
    if err != nil {
        t.Fatal(err)
    }

    var repos []GitHubRepo
    json.Unmarshal(data, &repos)
}
```

### Option 3: HTTP test servers

```go
func TestWithMockServer(t *testing.T) {
    fixtureData := testdata.MustLoadFixture(testdata.GitHubReposSuccess)

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.Write(fixtureData)
    }))
    defer server.Close()

    // Use server.URL in tests
}
```

## Fixture Format

### Success Responses

Success fixtures should match the actual API response format as closely as possible.

### Error Responses

Error fixtures should include:

- Appropriate HTTP status codes (returned by test server)
- Error message in the API's standard format
- Any additional error metadata (error codes, references, etc.)

## Adding New Fixtures

1. Create a new JSON file in the appropriate directory
2. Add a constant for it in `fixtures.go`
3. Document it in this README
4. Use realistic data that represents actual API responses

## Best Practices

- **Keep fixtures realistic**: Match actual API response structures
- **Include edge cases**: Empty arrays, null values, large datasets
- **Version fixtures**: If API versions change, create separate fixture files
- **Document assumptions**: Add comments in JSON if the format is unusual
- **Test coverage**: Each fixture should be used by at least one test

## Maintenance

- Review fixtures when API versions are updated
- Add new fixtures for new integration features
- Remove outdated fixtures when APIs are deprecated
- Keep fixtures small and focused on specific scenarios
