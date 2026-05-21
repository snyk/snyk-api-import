# Command Reference

Complete reference for all `snyk-api-import` commands and flags.

## Table of Contents

- [Global Flags](#global-flags)
- [Commands](#commands)
  - [orgs:data](#orgsdata)
  - [orgs:create](#orgscreate)
  - [import:data](#importdata)
  - [import](#import)
  - [sync](#sync)
  - [list:imported](#listimported)
  - [help](#help)

## Global Flags

These environment variables affect all commands:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SNYK_TOKEN` | Snyk API token | Yes | - |
| `SNYK_LOG_PATH` | Directory for logs and generated files | No | `.` |
| `SNYK_API` | Snyk API base URL (supports regional endpoints) | No | `https://api.snyk.io` |
| `SNYK_API_URL` | Alternative to `SNYK_API` (used by config.toml) | No | `https://api.snyk.io` |
| `DEBUG` | Enable debug logging (`snyk*`) | No | - |

### Regional Endpoints

The tool supports all Snyk regional endpoints. Set `SNYK_API` to your region:

- **US-01** (default): `https://api.snyk.io`
- **US-02**: `https://api.us.snyk.io`
- **EU-01**: `https://api.eu.snyk.io`
- **AU-01**: `https://api.au.snyk.io`

**Example:**
```bash
export SNYK_API="https://api.eu.snyk.io"
export SNYK_TOKEN="your-eu-region-token"
snyk-api-import import --source github
```

**Note:** Most configuration can be set via `config.toml` file. See [Configuration Priority](#configuration-priority) below.

---

## Configuration Priority

When the same setting is defined in multiple places, the priority order is:

1. **Command-line flags** (highest priority)
2. **Environment variables**
3. **config.toml file** (lowest priority)

This allows you to set defaults in `config.toml` and override them as needed.

---

## Commands

### orgs:data

Generate organization data from your source control system.

**Usage:**

```bash
snyk-api-import orgs:data [flags]
```

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--source` | string | Yes | Source type: `github`, `github-enterprise`, `github-cloud-app`, `gitlab`, `bitbucket-cloud`, `bitbucket-cloud-app`, `bitbucket-server`, `azure-repos` |
| `--groupId` | string | Yes | Snyk group public ID |
| `--sourceUrl` | string | No | Custom SCM base URL (for GitHub Enterprise, self-hosted GitLab, Bitbucket Server, Azure DevOps Server) |
| `--skipEmptyOrgs` | boolean | No | Skip organizations with no repositories |
| `--sourceOrgPublicId` | string | No | Snyk org ID to copy settings from |
| `--azureOrgs` | string | No | Comma-separated Azure DevOps org names (for `azure-repos` on-premise) |

**Output:**

Creates `group-<groupId>-<source>-orgs.json` in `SNYK_LOG_PATH`.

**Examples:**

```bash
# GitHub.com
snyk-api-import orgs:data --source=github --groupId=abc123

# GitHub Enterprise Server with custom URL
snyk-api-import orgs:data \
  --source=github \
  --sourceUrl=https://github.mycompany.com \
  --groupId=abc123

# Self-hosted GitLab with custom URL
snyk-api-import orgs:data \
  --source=gitlab \
  --sourceUrl=https://gitlab.mycompany.com \
  --groupId=abc123

# Skip empty organizations
snyk-api-import orgs:data \
  --source=gitlab \
  --groupId=abc123 \
  --skipEmptyOrgs

# Copy settings from existing org
snyk-api-import orgs:data \
  --source=github \
  --groupId=abc123 \
  --sourceOrgPublicId=org-xyz

# Azure DevOps Server (on-premise) with custom URL
snyk-api-import orgs:data \
  --source=azure-repos \
  --sourceUrl=https://dev.azure.mycompany.com \
  --groupId=abc123 \
  --azureOrgs=myorg1,myorg2
```

**Integration-Specific Environment Variables:**

| Integration | Variables |
|-------------|-----------|
| `github`, `github-enterprise` | `GITHUB_TOKEN` |
| `github-cloud-app` | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID` (optional, recommended for multiple installations) |
| `gitlab` | `GITLAB_TOKEN` |
| `bitbucket-cloud` | `BITBUCKET_CLOUD_USERNAME`, `BITBUCKET_CLOUD_PASSWORD` |
| `bitbucket-cloud-app` | `BITBUCKET_APP_CLIENT_ID`, `BITBUCKET_APP_CLIENT_SECRET` |
| `bitbucket-server` | `BITBUCKET_SERVER_TOKEN`, `BITBUCKET_SERVER_URL` |
| `azure-repos` | `AZURE_TOKEN`, `AZURE_BASE_URL` |

**Note:** All integration credentials can also be configured in `config.toml`. See [Authentication Guide](authentication.md) for details.

---

### orgs:create

Create Snyk organizations from generated organization data.

**Usage:**

```bash
snyk-api-import orgs:create [flags]
```

**Flags:**

| Flag | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| `--file` | string | Yes | Path to orgs data file (from `orgs:data`) | - |
| `--noDuplicateNames` | boolean | No | Skip org creation if an org with the same name already exists | `false` |
| `--includeExistingOrgsInOutput` | boolean | No | Include existing orgs in output file even if not newly created | `false` |

**Output:**

Creates `snyk-created-orgs.json` in `SNYK_LOG_PATH`.

**Examples:**

```bash
# Basic usage (skips duplicates by default)
snyk-api-import orgs:create --file=group-abc123-github-orgs.json

# Allow duplicate org names (will attempt to create even if exists)
snyk-api-import orgs:create \
  --file=group-abc123-github-orgs.json \
  --noDuplicateNames=false

# Include existing orgs in the output file
snyk-api-import orgs:create \
  --file=group-abc123-github-orgs.json \
  --includeExistingOrgsInOutput
```

**Environment Variables:**

| Variable | Required |
|----------|----------|
| `SNYK_TOKEN` | Yes |

---

### import:data

Generate import targets file from organization data.

**Usage:**

```bash
snyk-api-import import:data [flags]
```

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--orgsData` | string | Yes | Path to created orgs file (from `orgs:create`) |
| `--source` | string | Yes | Source type (same as `orgs:data`) |
| `--sourceUrl` | string | No | Custom SCM base URL (for GitHub Enterprise, self-hosted GitLab, Bitbucket Server, Azure DevOps Server) |
| `--integrationId` | string | No | Override integration ID for all targets |

**Output:**

Creates `<source>-import-targets.json` in `SNYK_LOG_PATH`.

**Examples:**

```bash
# Basic usage
snyk-api-import import:data \
  --source=github \
  --orgsData=snyk-created-orgs.json

# Override integration ID
snyk-api-import import:data \
  --source=gitlab \
  --orgsData=snyk-created-orgs.json \
  --integrationId=abcd-1234-efgh-5678
```

**Integration-Specific Environment Variables:**

Same as `orgs:data` command.

---

### import

Import repositories into Snyk.

**Usage:**

```bash
snyk-api-import import [flags]
```

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--file` | string | No | Path to import targets file (auto-detected if in `SNYK_LOG_PATH`) |
| `--source` | string | No | Source type - validates that import file matches this integration (default: `github`) |
| `--concurrency` | int | No | Max concurrent imports (default: 10) |

**Import targets JSON (optional fields):**

| Field | Description |
|-------|-------------|
| `files` | `[{"path": "package.json"}]` — import only these paths from the target |
| `exclusionGlobs` | Comma-separated folder names for the Import API. Omitted → field not sent (Snyk defaults). `""` → no exclusions. Non-empty → sent as written. Bulk import does **not** merge tool default exclusions. |

See [import.md](import.md) for examples.

**Important:** When using `--file` with a custom filename, you should also specify `--source` to ensure the import file's `integrationId` matches the intended integration. The tool will validate this against the Snyk API.

**Output:**

Generates several log files in `SNYK_LOG_PATH`:

- `<orgId>.imported-projects.log` - Successfully imported projects
- `<orgId>.failed-imports.log` - Failed import attempts (with retry details)
- `<orgId>.import-job-results.log` - Detailed import job status and results
- `imported-targets.log` - All processed targets

**Examples:**

```bash
# Auto-detect targets file from SNYK_LOG_PATH (looks for <source>-import-targets.json)
snyk-api-import import

# Explicit targets file with source validation
snyk-api-import import --file=path/to/my-targets.json --source=github

# Custom concurrency
snyk-api-import import --concurrency=5

# Using environment variable for concurrency
export IMPORT_CONCURRENCY=20
snyk-api-import import
```

**Environment Variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `SNYK_TOKEN` | Yes | Snyk API token |
| `SNYK_LOG_PATH` | Recommended | Output directory for logs |
| `IMPORT_CONCURRENCY` | No | Max concurrent imports (default: 10) |
| `SNYK_IMPORT_CONCURRENCY` | No | Alternative name for import concurrency |

---

### sync

Synchronize Snyk projects with source control changes.

**Usage:**

```bash
snyk-api-import sync [flags]
```

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--orgPublicId` | string | Yes | Snyk organization public ID |
| `--source` | string | No | Source type (default: `github`) |
| `--sourceUrl` | string | No | Custom SCM base URL (for GitHub Enterprise, self-hosted GitLab, Bitbucket Server, Azure DevOps Server) |
| `--snykProduct` | string | No | Filter by Snyk product: `openSource`, `container`, or `iac` |
| `--exclusionGlobs` | string | No | Comma-separated patterns for sync manifest discovery (also sets `EXCLUSION_GLOBS`). Combined with built-in defaults. Does not affect bulk `import --file` (use per-target `exclusionGlobs` in JSON). |
| `--dryRun` | boolean | No | Preview changes without executing |
| `--verbose` | boolean | No | Enable verbose logging |
| `--enableBranchUpdateFallback` | boolean | No | Fallback to deactivate+import if branch update fails |
| `--concurrency` | int | No | Max concurrent imports for new files (default: 10) |

**What Sync Does:**

1. **Update Branches**: Updates monitored branch to match default branch in SCM
2. **Deactivate Stale Projects**: Removes projects for deleted/renamed files
3. **Import New Files**: One Import API call per missing manifest, with `files: [{path}]` and merged `exclusionGlobs` (user + defaults; respects `--concurrency`)
4. **Handle Archived Repos**: Deactivates all projects for archived repos

**Exclusion configuration (sync only):** `--exclusionGlobs` flag, `EXCLUSION_GLOBS` environment variable, or `exclusion_globs` in `config.toml` under `[import]`. Discovery uses substring matching; prefer simple names like `fixtures` or `logs`.

**Performance:** Sync uses an optimized manifest cache to avoid re-cloning repositories on subsequent runs. The cache is stored in `SNYK_LOG_PATH` and is automatically managed.

**Output:**

Generates log files in `SNYK_LOG_PATH`:

- `<orgId>.updated-projects.log` - Projects that were updated
- `<orgId>.failed-to-sync-target.log` - Targets that failed to sync
- `<orgId>.imported-projects.log` - New files that were imported during sync
- `<orgId>.failed-imports.log` - New files that failed to import
- Manifest cache files (`.manifest-cache-<orgId>.json`) - Cached repository contents

**Examples:**

```bash
# Dry run (preview only)
snyk-api-import sync \
  --source=github \
  --orgPublicId=org-123 \
  --dryRun

# Live sync
snyk-api-import sync \
  --source=gitlab \
  --orgPublicId=org-456

# Verbose mode
snyk-api-import sync \
  --source=bitbucket-cloud-app \
  --orgPublicId=org-789 \
  --verbose

# With branch update fallback
snyk-api-import sync \
  --source=github-cloud-app \
  --orgPublicId=org-abc \
  --enableBranchUpdateFallback

# GitHub Enterprise with custom URL
snyk-api-import sync \
  --source=github \
  --sourceUrl=https://github.mycompany.com \
  --orgPublicId=org-123

# Sync only open source projects
snyk-api-import sync \
  --source=github \
  --orgPublicId=org-123 \
  --snykProduct=openSource

# Exclude paths during discovery (simple names recommended)
snyk-api-import sync \
  --source=github \
  --orgPublicId=org-123 \
  --exclusionGlobs="test,fixtures,logs"
```

**Integration-Specific Environment Variables:**

Same as `orgs:data` command.

---

### list:imported

List previously imported targets to skip during re-import.

**Usage:**

```bash
snyk-api-import list:imported [flags]
```

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--groupId` | string | Yes | Snyk group ID |
| `--orgId` | string | No* | Snyk org public ID (alternative to `--orgsFile`) |
| `--integrationType` | string | Yes | Integration type: `github`, `github-enterprise`, `github-cloud-app`, `gitlab`, `bitbucket-cloud`, `bitbucket-cloud-app`, `bitbucket-server`, `azure-repos` |
| `--source` | string | No | ⚠️ **Deprecated**: Use `--integrationType` instead (still works with deprecation warning) |
| `--orgsFile` | string | No* | Path to orgs file |
| `--outputFile` | string | No | Output file name (default: `imported-targets.json`) |

*Either `--orgId` or `--orgsFile` must be provided (not both)

**Output:**

Creates `imported-targets.json` (or custom filename) in `SNYK_LOG_PATH`.

**Examples:**

```bash
# List all imported GitHub repos for a single org
snyk-api-import list:imported \
  --integrationType=github \
  --groupId=abc123 \
  --orgId=org-456

# List all imported GitHub repos from orgs file
snyk-api-import list:imported \
  --integrationType=github \
  --groupId=abc123 \
  --orgsFile=snyk-created-orgs.json

# Custom output file
snyk-api-import list:imported \
  --integrationType=gitlab \
  --groupId=abc123 \
  --orgsFile=snyk-created-orgs.json \
  --outputFile=already-imported.json

# Using deprecated --source flag (still works with warning)
snyk-api-import list:imported \
  --source=github \
  --groupId=abc123 \
  --orgId=org-456
```

**Usage in Import Workflow:**

When `imported-targets.log` exists in `SNYK_LOG_PATH`, the `import` command
automatically skips previously imported targets.

---

### help

Display help information.

**Usage:**

```bash
snyk-api-import help
snyk-api-import --help
snyk-api-import -h
```

---

## Common Workflows

### Initial Bulk Import

```bash
# 1. Generate org data
snyk-api-import orgs:data --source=github --groupId=<group-id>

# 2. Create orgs in Snyk
snyk-api-import orgs:create --file=group-<group-id>-github-orgs.json

# 3. Generate import targets
snyk-api-import import:data --source=github --orgsData=snyk-created-orgs.json

# 4. Run import
snyk-api-import import
```

### Re-import (Skip Existing)

```bash
# 1. Generate list of already-imported targets
snyk-api-import list:imported \
  --source=github \
  --groupId=<group-id> \
  --orgsFile=snyk-created-orgs.json

# 2. Generate org data (skip empty)
snyk-api-import orgs:data \
  --source=github \
  --groupId=<group-id> \
  --skipEmptyOrgs

# 3. Create any new orgs (skip duplicates)
snyk-api-import orgs:create \
  --file=group-<group-id>-github-orgs.json \
  --noDuplicateNames

# 4. Generate import targets
snyk-api-import import:data \
  --source=github \
  --orgsData=snyk-created-orgs.json

# 5. Run import (automatically skips imported-targets.log entries)
snyk-api-import import
```

### Sync Workflow

```bash
# Preview changes
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id> \
  --dryRun

# Apply changes
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id>
```

## Environment Variable Examples

### Complete Setup for GitHub

```bash
export SNYK_TOKEN=snyk-token-here
export GITHUB_TOKEN=ghp_github-token-here
export SNYK_LOG_PATH=./logs
export IMPORT_CONCURRENCY=10
```

### Complete Setup for GitHub Cloud App

```bash
export SNYK_TOKEN=snyk-token-here
export GITHUB_APP_ID=123456
export GITHUB_APP_INSTALLATION_ID=789012  # Optional, can be auto-discovered
export GITHUB_APP_PRIVATE_KEY="$(cat github-app-key.pem)"
export SNYK_LOG_PATH=./logs
```

**Alternative:** Use `config.toml` for cleaner configuration:

```toml
[snyk]
token = "your-snyk-token"

[logging]
path = "./logs"

[integrations.github-cloud-app]
enabled = true
app_id = "123456"
installation_id = "789012"
private_key_path = "/path/to/private-key.pem"
```

### Complete Setup for GitLab

```bash
export SNYK_TOKEN=snyk-token-here
export GITLAB_TOKEN=glpat-gitlab-token-here
export GITLAB_BASE_URL=https://gitlab.mycompany.com
export SNYK_LOG_PATH=./logs
```

### Complete Setup for Bitbucket Cloud App

```bash
export SNYK_TOKEN=snyk-token-here
export BITBUCKET_APP_CLIENT_ID=your-client-id
export BITBUCKET_APP_CLIENT_SECRET=your-client-secret
export SNYK_LOG_PATH=./logs
```

### Complete Setup for Azure DevOps

```bash
export SNYK_TOKEN=snyk-token-here
export AZURE_TOKEN=your-azure-pat
export AZURE_BASE_URL=https://dev.azure.com/myorg
export SNYK_LOG_PATH=./logs
```

## Troubleshooting Commands

### View Logs

```bash
# Pretty-print JSON logs
jq . logs/<org-id>.imported-projects.log

# Count successful imports
jq -s length logs/<org-id>.imported-projects.log

# View failed imports (with retry details)
jq . logs/<org-id>.failed-imports.log

# View import job results
jq . logs/<org-id>.import-job-results.log

# Filter by project type
jq 'select(.projectType == "npm")' logs/<org-id>.imported-projects.log

# Count failed imports
jq -s length logs/<org-id>.failed-imports.log
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=snyk*
snyk-api-import <command>

# Or use verbose flag for sync
snyk-api-import sync --verbose --source=github --orgPublicId=<org-id>
```

For more examples and workflows, see [Advanced Workflows](advanced-workflows.md)
