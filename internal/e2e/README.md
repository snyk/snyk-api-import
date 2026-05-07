# End-to-End (E2E) Integration Tests

This directory contains E2E integration tests that interact with **real cloud APIs** to validate the complete workflow of `snyk-api-import`.

## 🎯 Philosophy

These tests use **real APIs** instead of mocks to:

- Validate actual API integration behavior
- Catch real-world edge cases
- Ensure compatibility with current API versions
- Test complete workflows end-to-end

## 🔧 Setup

### Required: Test Accounts

You'll need test accounts/organizations in each platform:

#### GitHub

- Personal Access Token with `repo` and `admin:org` scopes
- Test organization with 2-3 small repositories

#### GitLab

- Personal Access Token with `api` scope
- Test group with 2-3 small projects

#### Bitbucket Cloud

- API Token (from <https://id.atlassian.com/manage-profile/security/api-tokens>)
- Required scopes: `read:account`, `read:project:bitbucket`, `read:repository:bitbucket`, `read:workspace:bitbucket`
- Test workspace with 2-3 repositories

#### Azure DevOps

- Personal Access Token with `Code (Read)` permission
- Test organization with 1-2 projects

#### Snyk

- API Token (from Snyk account settings)
- Test organization for imports
- Test group ID

### Environment Variables

Create a `.env.e2e` file (not tracked in git):

```bash
# Enable E2E tests
export RUN_E2E_TESTS=true
export E2E_CLEANUP=true  # Set to false to keep test resources

# GitHub
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_TEST_ORG=your-test-org
export GITHUB_TEST_ORG_PUBLIC_ID=your-github-snyk-org-public-id  # Required for sync

# GitLab
export GITLAB_TOKEN=glpat-your_token_here
export GITLAB_TEST_GROUP=your-test-group-name  # Group name (e.g., "my-group")
export GITLAB_TEST_ORG_PUBLIC_ID=your-gitlab-snyk-org-public-id  # Optional, for sync

# Bitbucket Cloud
export BITBUCKET_CLOUD_USERNAME=your_username
export BITBUCKET_CLOUD_PASSWORD=your_api_token_here
export BITBUCKET_TEST_WORKSPACE=your-workspace
export BITBUCKET_TEST_ORG_PUBLIC_ID=your-bitbucket-snyk-org-public-id  # Optional, for sync

# Azure DevOps
export AZURE_TOKEN=your_pat_token_here
export AZURE_TEST_ORG=your-org-name
export AZURE_BASE_URL=https://dev.azure.com  # Or https://your-org.visualstudio.com
export AZURE_TEST_ORG_PUBLIC_ID=your-azure-snyk-org-public-id  # Optional, for sync

# Snyk
export SNYK_TOKEN=your_snyk_token_here
export SNYK_TEST_ORG_ID=your-org-id
export SNYK_TEST_GROUP_ID=your-group-id
```

Then source it:

```bash
source .env.e2e
```

## 🚀 Running Tests

### All E2E Tests

```bash
# Must have RUN_E2E_TESTS=true
go test ./internal/e2e -v -timeout=30m
```

### Specific Integration

```bash
go test ./internal/e2e -run TestE2E_GitHub -v
go test ./internal/e2e -run TestE2E_GitLab -v
go test ./internal/e2e -run TestE2E_Bitbucket -v
go test ./internal/e2e -run TestE2E_Azure -v
```

### Without Cleanup (for debugging)

```bash
export E2E_CLEANUP=false
go test ./internal/e2e -run TestE2E_GitHub -v
```

### Skip E2E Tests (default)

```bash
# E2E tests are automatically skipped if RUN_E2E_TESTS != "true"
go test ./...
```

## 📋 Test Structure

Each integration test follows this pattern:

```go
func TestE2E_GitHub_FullWorkflow(t *testing.T) {
    cfg := e2e.LoadE2EConfig()
    e2e.SkipIfDisabled(t, cfg)

    // 1. Setup
    testDir := e2e.SetupTestDir(t)
    cleanup := e2e.NewCleanupTestResources(t, cfg)

    // 2. Test orgs:data command
    // 3. Test orgs:create command
    // 4. Test import:data command
    // 5. Test import command
    // 6. Test sync command

    // 7. Verify results
    // 8. Cleanup (automatic via t.Cleanup)
}
```

## 🧪 What Gets Tested

### For Each Integration:

1. **`orgs:data` Command**
   - List organizations/groups from SCM
   - Generate org data file
   - Validate output format

2. **`orgs:create` Command** (if applicable)
   - Create Snyk organizations
   - Verify creation in Snyk

3. **`import:data` Command**
   - Generate import targets from org data
   - Include integration IDs
   - Validate target format

4. **`import` Command**
   - Import repositories to Snyk
   - Poll for completion
   - Verify projects created

5. **`sync` Command**
   - Compare Snyk vs SCM state
   - Identify missing/stale projects
   - Detect branch changes
   - Execute updates

6. **Error Scenarios**
   - Invalid credentials
   - Missing repositories
   - API rate limits

## ⏱️ Test Duration

E2E tests are **slow** because they:

- Make real API calls
- Wait for import jobs to complete
- Process actual repositories

**Expected duration:**

- Single integration: 2-5 minutes
- All integrations: 15-30 minutes

**Use `-short` flag to skip:**

```bash
go test ./... -short  # Skips E2E tests
```

## 🔒 Security

**⚠️ NEVER commit API tokens to git!**

- Use `.env.e2e` (in `.gitignore`)
- Use GitHub Actions secrets for CI/CD
- Rotate tokens regularly
- Use dedicated test accounts (not production)

## 🐛 Debugging

### View Test Artifacts

By default, test artifacts are in a temp directory that gets cleaned up.

To keep artifacts for inspection:

```bash
export E2E_CLEANUP=false
go test ./internal/e2e -run TestE2E_GitHub -v
# Check $TMPDIR for test directories
```

### View Detailed Logs

```bash
# Enable verbose logging
export SNYK_LOG_LEVEL=debug
go test ./internal/e2e -run TestE2E_GitHub -v
```

### Test Individual Steps

E2E tests can be broken down:

```bash
# Test only orgs:data
go test ./internal/e2e -run TestE2E_GitHub_OrgsData -v

# Test only import
go test ./internal/e2e -run TestE2E_GitHub_Import -v
```

## 📊 Coverage Impact

E2E tests significantly improve coverage:

| Area | Before E2E | After E2E | Impact |
|------|------------|-----------|--------|
| `cmd/*` | 25% | 65-75% | +40-50% |
| `internal/*` | 23% | 55-65% | +32-42% |
| **Overall** | **23.7%** | **55-65%** | **+31-41%** |

## 🔄 CI/CD Integration

See `.github/workflows/e2e.yml` for GitHub Actions setup.

**Key points:**

- Runs nightly (scheduled)
- Can be triggered manually
- Uses GitHub Actions secrets for tokens
- Uploads test artifacts on failure

## 📝 Adding New E2E Tests

1. Create `[integration]_e2e_test.go`
2. Follow the standard test structure
3. Use helpers from `helpers.go`
4. Add required env vars to this README
5. Update `.github/workflows/e2e.yml`

## 🎯 Best Practices

1. **Keep test accounts isolated** - Use dedicated test organizations
2. **Use small repositories** - Faster tests, lower API usage
3. **Clean up resources** - Default E2E_CLEANUP=true
4. **Handle rate limits** - Add delays if needed
5. **Test real scenarios** - Don't just test happy path
6. **Document requirements** - Update this README

## 🚨 Troubleshooting

### "E2E tests disabled"

Set `RUN_E2E_TESTS=true` in your environment.

### "Missing required environment variables"

Check that all required tokens/configs are set.

### "API rate limit exceeded"

Wait and retry, or use different test account.

### "Test timeout"

Increase timeout: `go test -timeout=60m`

### "Import job never completes"

Check Snyk UI for actual job status.

## 📚 References

- [Snyk API Documentation](https://docs.snyk.io/snyk-api)
- [GitHub API](https://docs.github.com/en/rest)
- [GitLab API](https://docs.gitlab.com/ee/api/)
- [Bitbucket API](https://developer.atlassian.com/cloud/bitbucket/rest/)
- [Azure DevOps API](https://learn.microsoft.com/en-us/rest/api/azure/devops/)

---

**Last Updated**: November 12, 2025
**Status**: Active - GitHub E2E tests implemented, others in progress
