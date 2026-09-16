# End-to-End (E2E) Integration Tests

This directory contains E2E integration tests that interact with **real cloud APIs** to validate the complete workflow of `snyk-api-import`.

## 🎯 Philosophy

These tests use **real APIs** instead of mocks to:

- Validate actual API integration behavior
- Catch real-world edge cases
- Ensure compatibility with current API versions
- Test complete workflows end-to-end

## 🔧 Setup

Setup has two halves. The Snyk half is easy to miss and is the most common cause of
confusing failures, so do it first.

### 1. Snyk side (required for every integration)

The tests do not pass an integration ID on the command line. `import:data` resolves
everything by lookup:

1. `GET /v1/group/{SNYK_TEST_GROUP_ID}/orgs` lists the orgs in your group
2. The SCM org name is matched against each Snyk org's **name or slug** (exact,
   case-sensitive)
3. `GET /v1/org/{matchedOrgId}/integrations` returns the integration ID

So inside the group named by `SNYK_TEST_GROUP_ID` you need:

- **A Snyk org whose name or slug exactly matches the SCM org/workspace/group.**
  If it does not match, targets are generated with an empty `orgID` and
  `integrationID`, and the `ImportData` assertions fail.
- **That Snyk org must have the SCM integration configured** (with its own
  credentials), because the integration ID comes from Snyk, not from your SCM token.

Integration key looked up per source:

| `--source` | Snyk integration key |
| --- | --- |
| `github` | `github` (or `github-enterprise` when a custom API URL is set) |
| `github-cloud-app` | `github-cloud-app` |
| `gitlab` | `gitlab` |
| `bitbucket-cloud` | `bitbucket-cloud` |
| `bitbucket-cloud-app` | `bitbucket-connect-app` (note: differs from the source name) |
| `azure-repos` | `azure-repos` |

Three names must line up: **SCM org name** == **`*_TEST_ORG` value** == **Snyk org
name or slug**. The E2E org filter is case-insensitive, but the Snyk org match is
case-sensitive.

`SNYK_TOKEN` needs group-level read (to enumerate orgs), org read (integrations and
targets), and org write only if you set `E2E_RUN_IMPORT=true`. A Group Admin service
account covers everything; a read-only token is sufficient for the default
configuration, since import is off and sync runs as a dry run.

### 2. SCM side

Each integration needs a test org/workspace/group containing a small number of
non-empty repositories (2-3 is plenty; repos need a default branch). Keep them small:
sync performs manifest discovery per repo, and the default client-side rate limit is
2 requests/second.

#### GitHub

API calls: `GET /user/orgs`, `GET /orgs/{org}/repos`,
`GET /repos/{owner}/{repo}/branches/{branch}`,
`GET /repos/{owner}/{repo}/git/trees/{sha}`.

- **Classic PAT:** `read:org` and `repo`. (`admin:org` is *not* required; nothing in
  this tool administers an org.)
- **Fine-grained PAT:** auto-discovery cannot work. GitHub returns
  `200` with an **empty list** for `GET /user/orgs` when using a fine-grained token,
  which surfaces later as a misleading `Test org ... not found in orgs data`. Pass
  `--githubOrgs=<org>` to skip that lookup; the tests do this automatically. With an
  explicit org list, a fine-grained PAT needs only repository permissions
  **Contents: Read** and **Metadata: Read** — no organization permissions.
- The token's user must be a member of the test org. If the org enforces PAT approval
  or third-party application restrictions, an unapproved token silently sees no orgs.

A token from the GitHub CLI works for local runs:

```bash
export GITHUB_TOKEN=$(gh auth token)   # default scopes include read:org and repo
```

#### GitLab

API calls: `ListGroups`, `ListGroupProjects`.

- Token scope: `api` (or `read_api` if you never enable import).
- **`GITLAB_TEST_GROUP` must be the group's full path, not its display name.**
  `orgs:data` writes `group.FullPath`, so a nested group needs `parent/child` — and
  the matching Snyk org must be named that too.

#### Bitbucket Cloud (basic auth)

API calls: `GET /2.0/user/workspaces`, `/2.0/repositories/{ws}`,
`/refs/branches/{branch}`, and `/src/{branch}/` for manifest discovery.

- Create an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>
- Required scopes: `read:account`, `read:workspace:bitbucket`,
  `read:project:bitbucket`, `read:repository:bitbucket`
- `BITBUCKET_CLOUD_USERNAME` is your Bitbucket username; `BITBUCKET_CLOUD_PASSWORD`
  is the API token (not your account password).

#### Bitbucket Cloud App (OAuth)

Uses the `client_credentials` grant against
`https://bitbucket.org/site/oauth2/access_token`, then the same `/2.0/` endpoints.

- The OAuth consumer must be marked **private** or `client_credentials` will not work.
- Same read grants as Bitbucket Cloud above.
- `BITBUCKET_APP_TEST_WORKSPACE` is effectively mandatory: `client_credentials` tokens
  frequently return an empty `/user/workspaces` list, and the client falls back to this
  env value.

#### Azure DevOps

API calls: `GET /_apis/projects`, `GET /_apis/git/repositories`, plus
`app.vssps.visualstudio.com` profile/accounts endpoints for org auto-discovery.

- PAT needs **Code (Read)** and **Project and Team (Read)**.
- The E2E tests always pass `--azureOrgs=$AZURE_TEST_ORG`, so org auto-discovery (which
  would additionally need Member Entitlement Management (Read)) is not exercised.

### 3. Environment variables

Create a `.env.e2e` file (ignored via the `.env.*` rule in `.gitignore`):

```bash
# --- Required for any E2E run ---
export RUN_E2E_TESTS=true
export SNYK_TOKEN=your_snyk_token_here
export SNYK_TEST_GROUP_ID=your-group-id

# --- Optional controls ---
export E2E_CLEANUP=true          # default true; set false to keep test resources
export E2E_RUN_IMPORT=false      # default false; true performs real imports (slow)
export E2E_RATE_LIMIT_RPS=2.0    # default 2.0
export E2E_RATE_LIMIT_BURST=10   # default 10
export E2E_RETRY_MAX=5           # default 5
export E2E_RETRY_BACKOFF_MS=1000 # default 1000

# --- GitHub ---
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_TEST_ORG=your-test-org
export GITHUB_TEST_ORG_PUBLIC_ID=your-github-snyk-org-public-id  # required for sync
export GITHUB_TEST_REPOS=repo-a,repo-b                           # optional; limits sync scope
export GITHUB_API_URL=https://api.github.com                     # optional

# --- GitLab ---
export GITLAB_TOKEN=glpat-your_token_here
export GITLAB_TEST_GROUP=your-group-full-path   # full path, e.g. "parent/child"
export GITLAB_TEST_ORG_PUBLIC_ID=...            # required for sync
export GITLAB_BASE_URL=https://gitlab.com       # optional

# --- Bitbucket Cloud (basic auth) ---
export BITBUCKET_CLOUD_USERNAME=your_username
export BITBUCKET_CLOUD_PASSWORD=your_api_token_here
export BITBUCKET_TEST_WORKSPACE=your-workspace
export BITBUCKET_TEST_ORG_PUBLIC_ID=...         # required for sync

# --- Bitbucket Cloud App (OAuth) ---
export BITBUCKET_APP_CLIENT_ID=your_client_id
export BITBUCKET_APP_CLIENT_SECRET=your_client_secret
export BITBUCKET_APP_TEST_WORKSPACE=your-workspace
export BITBUCKET_APP_TEST_ORG_PUBLIC_ID=...     # required for sync

# --- Azure DevOps ---
export AZURE_TOKEN=your_pat_token_here
export AZURE_TEST_ORG=your-org-name
export AZURE_BASE_URL=https://dev.azure.com     # optional
export AZURE_TEST_ORG_PUBLIC_ID=...             # required for sync
```

Then source it:

```bash
source .env.e2e
```

Notes:

- `SNYK_LOG_PATH` does **not** need to be set. `SetupTestDir` points it at a per-test
  temporary directory.
- `SNYK_TEST_ORG_ID` is read into the config struct but is currently unused by any test.
- Preflight validation (`RequireEnvVars`) only checks the integration's primary token,
  its org variable, `SNYK_TOKEN`, and `SNYK_TEST_GROUP_ID`. A missing
  `BITBUCKET_CLOUD_PASSWORD` or `BITBUCKET_APP_CLIENT_SECRET` is **not** caught up
  front and instead fails later as an authentication error.
- If `*_TEST_ORG_PUBLIC_ID` is unset, the `Sync` subtest skips (the other steps still run).
- `GITHUB_TEST_REPOS` is optional but recommended for orgs containing public
  repositories. Sync scopes its work by **org**, not by the targets file, so it
  enumerates every repository the token can see and runs branch/tree discovery on each.
  Fine-grained tokens always retain read access to public repositories, so restricting a
  token's repository access does **not** shrink this list. `GITHUB_TEST_REPOS` passes
  `--githubRepos`, which scopes both the SCM side and the Snyk projects considered.

## 🚀 Running Tests

### All E2E Tests

```bash
# Must have RUN_E2E_TESTS=true
go test ./internal/e2e -v -timeout=30m
```

### Specific Integration

Running one integration reads only that integration's environment variables, so you can
set up GitHub alone and ignore the rest:

```bash
go test ./internal/e2e -run TestE2E_GitHub_FullWorkflow -v -timeout=30m
go test ./internal/e2e -run TestE2E_GitLab_FullWorkflow -v -timeout=30m
go test ./internal/e2e -run TestE2E_Bitbucket_FullWorkflow -v -timeout=30m
go test ./internal/e2e -run TestE2E_BitbucketApp_FullWorkflow -v -timeout=30m
go test ./internal/e2e -run TestE2E_Azure_FullWorkflow -v -timeout=30m

# All tests for one integration (full workflow plus the focused ones)
go test ./internal/e2e -run 'TestE2E_GitHub' -v -timeout=30m
```

Always pass `-timeout` of at least 30m. The per-test context timeout is hard-coded to
30 minutes, so Go's default 10m test timeout would abort the binary first.

### Without Cleanup (for debugging)

```bash
export E2E_CLEANUP=false
go test ./internal/e2e -run TestE2E_GitHub_FullWorkflow -v
```

### Skip E2E Tests (default)

E2E tests skip automatically unless `RUN_E2E_TESTS=true`:

```bash
go test ./...        # E2E tests skip
make test-short      # E2E tests skip
```

Note that these tests are gated on `RUN_E2E_TESTS`, not on `testing.Short()`, so
`-short` alone has no additional effect on them.

## 📋 Test Structure

Each integration declares an `IntegrationTestConfig` and delegates to the shared
`RunFullWorkflowTest` helper:

```go
var githubConfig = IntegrationTestConfig{
    Source:            "github",
    TokenEnvVar:       "GITHUB_TOKEN",
    OrgEnvVar:         "GITHUB_TEST_ORG",
    OrgPublicIDEnvVar: "GITHUB_TEST_ORG_PUBLIC_ID",
    SupportsOptimized: true,
}

func TestE2E_GitHub_FullWorkflow(t *testing.T) {
    cfg := LoadE2EConfig()

    githubConfig.Token = cfg.GitHubToken
    githubConfig.TestOrg = cfg.GitHubTestOrg
    githubConfig.OrgPublicID = cfg.GitHubTestOrgPublicID
    githubConfig.ExtraOrgsDataArgs = []string{"--githubOrgs=" + cfg.GitHubTestOrg}

    RunFullWorkflowTest(t, cfg, githubConfig)
}
```

`RunFullWorkflowTest` skips when disabled, validates env vars, configures rate
limiting, creates a temp working directory, and then runs the subtests below.

The helpers mutate `os.Args`, process environment variables, and the working
directory, so these tests cannot run in parallel.

## 🧪 What Gets Tested

`RunFullWorkflowTest` runs four subtests:

1. **`OrgsData`** — runs `orgs:data`, filters the output down to the configured test
   org, validates the org name and group ID
2. **`ImportData`** — runs `import:data`, validates that each target has a name, owner,
   branch, org ID, and integration ID
3. **`Import`** — **skipped unless `E2E_RUN_IMPORT=true`**; performs real imports
4. **`Sync`** — runs `sync` with `--dryRun=true`; skipped if the integration's
   `*_TEST_ORG_PUBLIC_ID` is unset

Per-integration files also define focused tests that can be run on their own:
`*_OrgsData`, `*_ImportData`, `*_Sync`, and `*_ErrorHandling` (invalid-token handling).

`orgs:create` is **not** exercised by these tests.

Sync performs manifest discovery even in dry-run mode, because that is how it computes
desired state. Discovery uses the Git Trees API on GitHub and the `/src/` endpoint on
Bitbucket Cloud. The manifest cache lives in the per-test temp directory, so every run
starts cold.

## ⏱️ Test Duration

E2E tests are **slow** because they:

- Make real API calls
- Wait for import jobs to complete (when `E2E_RUN_IMPORT=true`)
- Process actual repositories

**Expected duration:**

- Single integration: 2-5 minutes
- All integrations: 15-30 minutes

Duration scales with the number of repositories in your test org, so prefer orgs with
a handful of small repos.

## 🔒 Security

**⚠️ NEVER commit API tokens to git!**

- Use `.env.e2e` (covered by the `.env.*` rule in `.gitignore`)
- Use GitHub Actions secrets for CI/CD
- Rotate tokens regularly
- Use dedicated test accounts (not production)
- Prefer `$(gh auth token)` over pasting a literal GitHub token into a file

## 🐛 Debugging

### View Test Artifacts

By default, test artifacts are in a temp directory that gets cleaned up.

To keep artifacts for inspection:

```bash
export E2E_CLEANUP=false
go test ./internal/e2e -run TestE2E_GitHub_FullWorkflow -v
# Check $TMPDIR for test directories
```

### View Detailed Logs

```bash
export SNYK_LOG_LEVEL=debug
go test ./internal/e2e -run TestE2E_GitHub_FullWorkflow -v
```

## 📊 Coverage

CI enforces a minimum total coverage threshold (see the `Check coverage threshold` step
in `.github/workflows/ci.yml`). E2E tests are not part of that measurement, since they
are skipped in the `lint-and-test` job; they exist to validate real API behavior rather
than to raise the coverage number.

## 🔄 CI/CD Integration

E2E tests run as the **`e2e-tests` job in `.github/workflows/ci.yml`** (there is no
separate `e2e.yml`).

**Key points:**

- Triggers on pull requests targeting `main` and on pushes to `main`. There is no
  scheduled/nightly run and no `workflow_dispatch` trigger.
- Runs after `lint-and-test` succeeds
- Uses a matrix with `fail-fast: false`. **Only `github` is currently enabled.** The
  `gitlab`, `bitbucket`, `bitbucket-app` and `azure` entries are commented out in the
  matrix until their `E2E_*` secrets and test orgs are set up. The tests still exist
  and run locally; re-enable one by adding its name back to the matrix list.
- Sets `E2E_RUN_IMPORT=false` to skip slow imports
- Reads tokens from `E2E_*`-prefixed repository secrets (GitHub Actions forbids secret
  names starting with `GITHUB_`, hence `E2E_GITHUB_TOKEN`)
- Uploads logs as artifacts on failure, retained 7 days

The job maps matrix names to test names, so they must stay in sync:

| Matrix value | Test function | Enabled in CI |
| --- | --- | --- |
| `github` | `TestE2E_GitHub_FullWorkflow` | ✅ |
| `gitlab` | `TestE2E_GitLab_FullWorkflow` | ❌ |
| `bitbucket` | `TestE2E_Bitbucket_FullWorkflow` | ❌ |
| `bitbucket-app` | `TestE2E_BitbucketApp_FullWorkflow` | ❌ |
| `azure` | `TestE2E_Azure_FullWorkflow` | ❌ |

The `case` statement and the per-integration `env:` block still cover every
integration, so re-enabling one only requires editing the matrix list.

The repo's automatic `GITHUB_TOKEN` cannot be used for these tests: it is a
repository-scoped installation token with no user identity, so `GET /user/orgs` returns
`403 Resource not accessible by integration`.

## 📝 Adding New E2E Tests

1. Create `[integration]_e2e_test.go`
2. Declare an `IntegrationTestConfig` and delegate to `RunFullWorkflowTest`
3. Use helpers from `helpers.go`
4. Add required env vars to this README
5. Add the integration to the matrix and env block in `.github/workflows/ci.yml`

## 🎯 Best Practices

1. **Keep test accounts isolated** — use dedicated test organizations
2. **Use small repositories** — faster tests, lower API usage
3. **Clean up resources** — default `E2E_CLEANUP=true`
4. **Handle rate limits** — tune via `E2E_RATE_LIMIT_*` and `E2E_RETRY_*`
5. **Test real scenarios** — don't just test the happy path
6. **Document requirements** — update this README

## 🚨 Troubleshooting

### "E2E tests disabled"

Set `RUN_E2E_TESTS=true` in your environment.

### "Missing required environment variables"

Check that all required tokens/configs are set. Remember that Bitbucket's second
credential (`BITBUCKET_CLOUD_PASSWORD` / `BITBUCKET_APP_CLIENT_SECRET`) is not
validated up front.

### "Test org ... not found in orgs data"

Most common causes, in order:

1. **Fine-grained GitHub PAT.** `GET /user/orgs` returns an empty list for
   fine-grained tokens. Use `--githubOrgs`, or a classic token with `read:org`.
2. **Name mismatch.** `GITHUB_TEST_ORG` / `BITBUCKET_TEST_WORKSPACE` / etc. must match
   the SCM org exactly. For GitLab it must be the group's **full path**.
3. **Token not authorized for the org** (PAT approval or third-party app restrictions).

### Targets generated with empty `orgID` / `integrationID`

No Snyk org in `SNYK_TEST_GROUP_ID` has a name or slug matching the SCM org, or that
Snyk org has no matching SCM integration configured. See "Snyk side" above.

### "API rate limit exceeded"

Lower `E2E_RATE_LIMIT_RPS`, raise `E2E_RETRY_MAX`, or use a different test account.

### "Test timeout"

Increase the timeout: `go test -timeout=60m`. Also check that your test org is not
unexpectedly large.

### "Import job never completes"

Check the Snyk UI for actual job status.

## 📚 References

- [Snyk API Documentation](https://docs.snyk.io/snyk-api)
- [GitHub API](https://docs.github.com/en/rest)
- [Permissions required for fine-grained GitHub PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [GitLab API](https://docs.gitlab.com/ee/api/)
- [Bitbucket API](https://developer.atlassian.com/cloud/bitbucket/rest/)
- [Azure DevOps API](https://learn.microsoft.com/en-us/rest/api/azure/devops/)

---

**Last Updated**: September 15, 2026
**Status**: Active — full-workflow E2E tests implemented for GitHub, GitLab,
Bitbucket Cloud, Bitbucket Cloud App, and Azure DevOps
