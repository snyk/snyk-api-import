# Bitbucket Server Integration

This guide covers importing and syncing repositories from Bitbucket Server (formerly Atlassian Stash) into Snyk.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Authentication](#authentication)
- [Quick Start](#quick-start)
- [Step-by-Step Guide](#step-by-step-guide)
- [Sync Workflow](#sync-workflow)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Bitbucket Server instance (self-hosted)
- Personal Access Token (PAT) from Bitbucket Server
- Snyk API Token
- Network access from your machine to both Snyk API and Bitbucket Server

## Authentication

### 1. Create Bitbucket Server Personal Access Token

1. Log in to your Bitbucket Server instance
2. Click on your profile → **Manage account**
3. Go to **Personal access tokens**
4. Click **Create token**
5. Set token permissions:
   - **Project permissions**: Read
   - **Repository permissions**: Read
6. Copy the token (you won't see it again!)

### 2. Set Environment Variables

```bash
export SNYK_TOKEN=your-snyk-api-token
export BITBUCKET_SERVER_TOKEN=your-bitbucket-server-token
export BITBUCKET_SERVER_URL=https://bitbucket.your-company.com
export SNYK_LOG_PATH=./logs
```

**Important:** The `BITBUCKET_SERVER_URL` should be your Bitbucket Server base URL without any path (e.g., `https://bitbucket.company.com`, not `https://bitbucket.company.com/projects`).

## Quick Start

```bash
# 1. Generate organization data from Bitbucket Server projects
snyk-api-import orgs:data \
  --source=bitbucket-server \
  --groupId=<your-snyk-group-id> \
  --sourceUrl=https://bitbucket.your-company.com

# 2. Create Snyk organizations (one per Bitbucket project)
snyk-api-import orgs:create \
  --file=group-<your-group-id>-bitbucket-server-orgs.json

# 3. Generate import targets from repositories
snyk-api-import import:data \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com \
  --orgsData=snyk-created-orgs.json

# 4. Import all repositories into Snyk
snyk-api-import import
```

## Step-by-Step Guide

### Step 1: Generate Organization Data

This command fetches all **projects** from your Bitbucket Server instance and creates a mapping file:

```bash
snyk-api-import orgs:data \
  --source=bitbucket-server \
  --groupId=<your-snyk-group-id> \
  --sourceUrl=https://bitbucket.your-company.com
```

**Output:** `group-<group-id>-bitbucket-server-orgs.json`

**Structure:**

- Each Bitbucket Server **project** (e.g., `PROJ`, `INFRA`) maps to one Snyk organization
- Empty projects (no repositories) are automatically excluded

**Example output:**

```json
{
  "orgData": [
    {
      "name": "PROJ (Bitbucket Server)",
      "sourceOrgId": "PROJ",
      "integrations": {
        "bitbucket-server": "PROJ"
      }
    }
  ]
}
```

### Step 2: Create Snyk Organizations

Create Snyk organizations based on the mapping file:

```bash
snyk-api-import orgs:create \
  --file=group-<your-group-id>-bitbucket-server-orgs.json
```

**Output:** `snyk-created-orgs.json`

This file contains:

- `orgId`: Snyk organization UUID
- `name`: Organization name in Snyk
- `integrations.bitbucket-server`: Bitbucket Server project key
- `created`: Timestamp when the org was created

### Step 3: Generate Import Targets

Generate a list of all repositories to import:

```bash
snyk-api-import import:data \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com \
  --orgsData=snyk-created-orgs.json
```

**Output:** One JSON file per Snyk organization (e.g., `bitbucket-server-import-targets.json`)

**What happens:**

- Fetches all repositories for each Bitbucket Server project
- Automatically discovers manifest files (pom.xml, package.json, etc.)
- Creates import targets for each discovered manifest
- Gets the default branch for each repository

**Example target:**

```json
{
  "target": {
    "name": "my-repo",
    "owner": "PROJ",
    "branch": "main"
  },
  "integrations": {
    "bitbucket-server": "PROJ"
  },
  "orgId": "uuid-of-snyk-org"
}
```

### Step 4: Run Import

Import all targets into Snyk:

```bash
snyk-api-import import
```

**Options:**

- `--orgPublicId`: Import to a specific organization
- `--dryRun`: Preview what would be imported without making changes

**What happens:**

- Reads all `*-import-targets.json` files in `SNYK_LOG_PATH`
- Creates import jobs in Snyk
- Polls for completion
- Logs results to `<orgId>.imported-projects.log`

## Sync Workflow

The `sync` command helps keep your Snyk projects in sync with your Bitbucket Server repositories.

### Basic Sync

```bash
snyk-api-import sync \
  --orgPublicId=<your-snyk-org-id> \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com \
  --dryRun
```

**What it does:**

1. Fetches Bitbucket Server project details and repositories
2. Discovers manifest files in each repository
3. Compares with existing Snyk projects
4. Identifies and (when not in dry-run mode) automatically applies:
   - **Missing repositories**: New repos or new manifests → Automatically imports them
   - **Stale projects**: Repos deleted from Bitbucket Server → Automatically deactivates them
   - **Branch updates**: Repos where the default branch changed → Automatically updates via PATCH API

### Sync Actions

**1. Detect missing repos/manifests (to add):**

```bash
# Preview
snyk-api-import sync \
  --orgPublicId=<org-id> \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com \
  --dryRun

# Apply changes (auto-import missing repos)
snyk-api-import sync \
  --orgPublicId=<org-id> \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com
```

**2. Detect and deactivate stale projects:**

```bash
# Preview what would be deactivated
snyk-api-import sync \
  --orgPublicId=<org-id> \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com \
  --dryRun

# Actually deactivate stale projects (removes --dryRun flag)
snyk-api-import sync \
  --orgPublicId=<org-id> \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com
```

**Note:** Stale project deactivation only applies to manifest-based projects (npm, Maven, Python, etc.). SAST projects are automatically skipped.

**3. Update branches automatically:**

```bash
# The tool automatically updates project branches via PATCH API
# Run without --dryRun to apply branch updates
snyk-api-import sync \
  --orgPublicId=<org-id> \
  --source=bitbucket-server \
  --sourceUrl=https://bitbucket.your-company.com
```

**Note:** Branch updates are applied automatically when you run sync without `--dryRun`. If the PATCH API fails for any project, the tool will fall back to deactivating the old project and importing the new one with the updated branch.

### Manifest Discovery

The sync command **automatically discovers manifest files** by checking for their existence at standard locations:

**Supported manifests:**

- Maven: `pom.xml`
- Gradle: `build.gradle`, `build.gradle.kts`
- npm: `package.json`, `package-lock.json`, `yarn.lock`
- Python: `requirements.txt`, `Pipfile`, `poetry.lock`
- Ruby: `Gemfile`, `Gemfile.lock`
- Go: `go.mod`
- PHP: `composer.json`
- Rust: `Cargo.toml`

**Example:** If you add a `package.json` to a Java repo that already has `pom.xml`, the next sync will detect it and suggest importing the new manifest.

## Advanced Usage

### Import Specific Projects Only

```bash
# Step 1: Generate org data for specific projects
# (Currently imports all projects, filter manually after generation)

# Step 2: Edit the JSON file to keep only desired projects
vim group-<group-id>-bitbucket-server-orgs.json

# Step 3: Continue with normal workflow
snyk-api-import orgs:create --file=group-<group-id>-bitbucket-server-orgs.json
```

### Custom Organization Names

Edit the generated `*-orgs.json` file to customize organization names:

```json
{
  "orgData": [
    {
      "name": "My Custom Org Name",
      "sourceOrgId": "PROJ",
      "integrations": {
        "bitbucket-server": "PROJ"
      }
    }
  ]
}
```

### Re-import Failed Projects

If some imports fail, use the `list:imported` command to skip successful ones:

```bash
# Generate list of already-imported targets
snyk-api-import list:imported \
  --orgsData=snyk-created-orgs.json \
  --integrationType=bitbucket-server

# Run import again (will skip already-imported targets)
snyk-api-import import
```

### Batch Processing Large Instances

For Bitbucket Server instances with many projects:

```bash
# 1. Generate all org data
snyk-api-import orgs:data \
  --source=bitbucket-server \
  --groupId=<group-id> \
  --sourceUrl=https://bitbucket.your-company.com

# 2. Split into batches
# (Edit JSON manually to create multiple files)

# 3. Process each batch
snyk-api-import orgs:create --file=batch-1-orgs.json
snyk-api-import import:data --source=bitbucket-server --orgsData=batch-1-created-orgs.json
snyk-api-import import

snyk-api-import orgs:create --file=batch-2-orgs.json
snyk-api-import import:data --source=bitbucket-server --orgsData=batch-2-created-orgs.json
snyk-api-import import
```

## Troubleshooting

### Authentication Errors

**Error:** `401 Unauthorized` or `Authentication failed`

**Solution:**

1. Verify your token is correct: `echo $BITBUCKET_SERVER_TOKEN`
2. Check token permissions (must have Project Read and Repository Read)
3. Test API access:

   ```bash
   curl -H "Authorization: Bearer $BITBUCKET_SERVER_TOKEN" \
     $BITBUCKET_SERVER_URL/rest/api/1.0/projects
   ```

### Network/Connection Issues

**Error:** `connection refused` or `timeout`

**Solution:**

1. Verify the URL is correct: `echo $BITBUCKET_SERVER_URL`
2. Check network access: `curl $BITBUCKET_SERVER_URL`
3. Verify firewall/VPN settings
4. If using a self-signed certificate, you may need to configure your system to trust it

### Project Key vs Project Name Mismatch

**Issue:** Snyk project names show different names than expected (e.g., `snyk-api-testing/repo` instead of `SNYK-API/repo`)

**Explanation:** This is **expected behavior**. Bitbucket Server has two identifiers per project:

- **Key**: `SNYK-API` (short, uppercase, used in URLs)
- **Name**: `SNYK API Testing` (human-readable, with spaces)

When Snyk imports from Bitbucket Server, it fetches the project details and uses the **name** field, which gets slugified to `snyk-api-testing`.

**The sync command handles this automatically** by:

1. Fetching project details to map KEY → NAME
2. Slugifying the project name the same way Snyk does
3. Using that for comparison

This ensures sync works correctly despite the KEY/NAME mismatch.

### Empty Projects Not Showing

**Expected behavior:** Projects with no repositories are automatically excluded from org data generation to avoid creating empty Snyk organizations.

### Manifest Discovery Not Finding Files

**Issue:** Repository has manifest files but they're not discovered

**Possible causes:**

1. **File is in a subdirectory**: Currently only checks root directory for most manifests. Workaround: Use `**/manifest.ext` patterns (e.g., `**/pom.xml`)
2. **Non-standard file name**: Use a custom manifest pattern
3. **File permissions**: Ensure the token has read access

**Workaround:**
Run sync to discover manifests, or manually create import targets with specific manifest paths.

### Sync Shows Wrong Branch

**Issue:** Sync detects branch changes that don't exist

**Solution:**
Check the repository's default branch in Bitbucket Server settings. The sync command uses the **default branch** configured in Bitbucket Server.

### Rate Limiting

Bitbucket Server may rate-limit API requests. The tool implements automatic throttling, but for very large instances:

1. Run imports during off-peak hours
2. Use batch processing (import projects in smaller groups)
3. Contact your Bitbucket Server admin to adjust rate limits

## Comparison with Bitbucket Cloud

| Feature | Bitbucket Cloud | Bitbucket Server |
|---------|----------------|------------------|
| Auth Method | Username + App Password or OAuth | Personal Access Token |
| API Base URL | `https://api.bitbucket.org/2.0` | Self-hosted (e.g., `https://bitbucket.company.com`) |
| Organization Model | Workspaces | Projects |
| Project Structure | `workspace/repo` | `project-key/repo` |
| Manifest Discovery | File search API | HEAD requests to check file existence |
| Sync Support | ✅ Yes | ✅ Yes |

## Additional Resources

- [Bitbucket Server API Documentation](https://docs.atlassian.com/bitbucket-server/rest/latest/bitbucket-rest.html)
- [Snyk Bitbucket Server Integration](https://docs.snyk.io/integrations/git-repository-scm-integrations/bitbucket-server-integration)
- [Creating Personal Access Tokens](https://confluence.atlassian.com/bitbucketserver/personal-access-tokens-939515499.html)

## Next Steps

- [Advanced Workflows](advanced-workflows.md) - Automation and CI/CD integration
- [Command Reference](command-reference.md) - Complete command documentation
- [Contributing](../CONTRIBUTING.md) - Report issues or contribute improvements
