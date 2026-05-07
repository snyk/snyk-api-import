# Advanced Workflows

This guide covers advanced use cases for snyk-api-import including syncing,
re-importing, automation, and troubleshooting.

## Table of Contents

- [Syncing Projects](#syncing-projects)
- [Re-importing New Repositories](#re-importing-new-repositories)
- [Skipping Previously Imported Targets](#skipping-previously-imported-targets)
- [Automating Imports](#automating-imports)
- [Large-Scale Imports](#large-scale-imports)
- [Handling Failures](#handling-failures)
- [Advanced Configuration](#advanced-configuration)

## Syncing Projects

The `sync` command keeps your Snyk projects in sync with your source control
system by detecting and applying changes.

### What Sync Does

| Action | Description |
|--------|-------------|
| **Update Branches** | Updates the monitored branch in Snyk to match the default branch in SCM |
| **Deactivate Stale** | Deactivates projects for files that were deleted, moved, or renamed |
| **Import New Files** | Imports newly added manifest files |
| **Handle Archives** | Deactivates all projects when a repository is archived |

### Basic Sync Workflow

**Step 1: Dry Run (Preview Changes)**

Always run with `--dryRun` first to preview what will change:

```bash
snyk-api-import sync \
  --source=github \
  --orgPublicId=your-org-id \
  --dryRun
```

Review the logs in `SNYK_LOG_PATH`:
- `<org-id>.updated-projects.log` - Projects that would be modified
- `<org-id>.failed-to-sync-target.log` - Any sync errors

**Step 2: Apply Changes**

If the dry run looks good, remove `--dryRun`:

```bash
snyk-api-import sync \
  --source=github \
  --orgPublicId=your-org-id
```

### Sync Examples by Integration

**GitHub:**

```bash
snyk-api-import sync --source=github --orgPublicId=<org-id>
```

**GitHub Cloud App:**

```bash
snyk-api-import sync --source=github-cloud-app --orgPublicId=<org-id>
```

**GitLab:**

```bash
snyk-api-import sync --source=gitlab --orgPublicId=<org-id>
```

**Bitbucket Cloud App:**

```bash
snyk-api-import sync --source=bitbucket-cloud-app --orgPublicId=<org-id>
```

**Azure DevOps:**

```bash
snyk-api-import sync --source=azure-repos --orgPublicId=<org-id>
```

### Understanding Sync Logs

**Updated Projects Log** (`<org-id>.updated-projects.log`):

```json
{
  "projectId": "abc-123",
  "action": "branch",
  "oldBranch": "master",
  "newBranch": "main",
  "dryRun": false,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

Action types:
- `branch` - Branch was updated
- `deactivate` - Project was deactivated
- `import` - New project was imported

**Failed Syncs Log** (`<org-id>.failed-to-sync-target.log`):

```json
{
  "target": "owner/repo",
  "error": "Repository not found or inaccessible",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Branch Update Behavior

When a repository's default branch changes (e.g., `master` → `main`):

1. **Default**: Snyk updates the `target_reference` on the existing project
2. **Fallback** (with `--enableBranchUpdateFallback`): If update fails,
   deactivate old project and import new one

**Enable Fallback:**

```bash
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id> \
  --enableBranchUpdateFallback
```

**Note:** The fallback is optional and disabled by default. Discuss with your
team before enabling in production.

### Excluding Files from Sync

Use the `--exclusionGlobs` flag to exclude specific patterns from sync operations:

```bash
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id> \
  --exclusionGlobs="**/test/**,**/fixtures/**,**/examples/**"
```

The tool automatically excludes common test directories:
- `node_modules`
- `test`, `tests`, `__tests__`, `__test__`
- `fixtures`
- `ci`
- `bower_components`
- `.git`

### Syncing Specific Product Types

Use the `--snykProduct` flag to filter by product type:

```bash
# Sync only Open Source projects
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id> \
  --snykProduct=openSource

# Sync multiple product types
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id> \
  --snykProduct=openSource \
  --snykProduct=container
```

Available products: `openSource`, `container`, `iac`

### Sync Scheduling

Run sync on a schedule to keep projects up-to-date:

**Daily Sync (Recommended):**

```bash
# Cron example: Run at 2 AM daily
0 2 * * * /usr/local/bin/snyk-api-import sync --source=github --orgPublicId=<org-id>
```

**Weekly Sync (Minimum):**

```bash
# Cron example: Run Sunday at 3 AM
0 3 * * 0 /usr/local/bin/snyk-api-import sync --source=github --orgPublicId=<org-id>
```

See [CI/CD Examples](examples/ci-cd-examples.md) for automation templates.

---

## Re-importing New Repositories

After your initial import, periodically check for new repositories and import them.

### Method 1: Using list:imported (Recommended)

This method uses the `list:imported` command to skip previously imported targets.

**Step 1: Generate List of Imported Targets**

```bash
snyk-api-import list:imported \
  --source=github \
  --groupId=<group-id> \
  --orgsFile=snyk-created-orgs.json
```

This creates `imported-targets.log` in `SNYK_LOG_PATH`.

**Step 2: Generate New Org Data**

```bash
snyk-api-import orgs:data \
  --source=github \
  --groupId=<group-id> \
  --skipEmptyOrgs
```

**Step 3: Create New Orgs (Skip Duplicates)**

Use the `--noDuplicateNames` flag to skip existing orgs:

```bash
snyk-api-import orgs:create \
  --file=group-<group-id>-github-orgs.json \
  --noDuplicateNames
```

**Step 4: Generate Import Targets**

```bash
snyk-api-import import:data \
  --source=github \
  --orgsData=snyk-created-orgs.json
```

**Step 5: Run Import**

The import command automatically skips targets listed in `imported-targets.log`:

```bash
snyk-api-import import
```

### Method 2: Using Sync

The `sync` command automatically imports new files/repos:

```bash
# For each Snyk org in your group
snyk-api-import sync \
  --source=github \
  --orgPublicId=<org-id>
```

**Pros:** Simpler, also handles updates and deletions
**Cons:** Requires running for each org separately

### Comparison: list:imported vs sync

| Feature | list:imported | sync |
|---------|---------------|------|
| Skip previously imported | ✅ Yes | ✅ Yes |
| Import new repos | ✅ Yes | ✅ Yes |
| Update changed projects | ❌ No | ✅ Yes |
| Deactivate stale projects | ❌ No | ✅ Yes |
| Runs on | Group level | Org level |
| Use Case | Periodic bulk re-imports | Continuous sync |

---

## Skipping Previously Imported Targets

### How It Works

1. The `list:imported` command queries Snyk for all projects in a group/org
2. It generates a log file with all imported targets
3. The `import` command reads this log and skips matching targets

### Format of imported-targets.log

```json
{"orgId": "org-123", "projectId": "proj-abc", "name": "owner/repo:path/to/package.json", "source": "github"}
{"orgId": "org-456", "projectId": "proj-def", "name": "owner/repo:Dockerfile", "source": "github"}
```

### Manual Filtering

You can manually edit `imported-targets.log` to control which targets are skipped:

```bash
# Remove specific targets to force re-import
jq 'select(.name != "owner/repo:package.json")' \
  logs/imported-targets.log > logs/imported-targets-filtered.log

mv logs/imported-targets-filtered.log logs/imported-targets.log
```

### Integration-Specific Behavior

Targets are matched based on:
- **GitHub/GitLab/Bitbucket:** Repository name + file path
- **Azure DevOps:** Organization + Project + Repository + file path

Same repository imported into different Snyk orgs will NOT be skipped (by design).

---

## Automating Imports

### Scheduling with Cron

**Initial Import + Weekly Re-import:**

```bash
# /etc/cron.d/snyk-import

# Full import flow - Sundays at 2 AM
0 2 * * 0 /opt/scripts/snyk-import-full.sh

# Sync all orgs - Daily at 3 AM
0 3 * * * /opt/scripts/snyk-sync-all.sh
```

**snyk-import-full.sh:**

```bash
#!/bin/bash
set -euo pipefail

export SNYK_TOKEN="$SNYK_TOKEN_SECRET"
export GITHUB_TOKEN="$GITHUB_TOKEN_SECRET"
export SNYK_LOG_PATH="/var/log/snyk-import"

cd /opt/snyk-import

# Generate list of previously imported
snyk-api-import list:imported \
  --source=github \
  --groupId=abc-123 \
  --orgsFile=snyk-created-orgs.json

# Generate org data (skip empty)
snyk-api-import orgs:data \
  --source=github \
  --groupId=abc-123 \
  --skipEmptyOrgs

# Create new orgs
snyk-api-import orgs:create \
  --file=group-abc-123-github-orgs.json

# Generate targets
snyk-api-import import:data \
  --source=github \
  --orgsData=snyk-created-orgs.json

# Run import
snyk-api-import import
```

**snyk-sync-all.sh:**

```bash
#!/bin/bash
set -euo pipefail

export SNYK_TOKEN="$SNYK_TOKEN_SECRET"
export GITHUB_TOKEN="$GITHUB_TOKEN_SECRET"
export SNYK_LOG_PATH="/var/log/snyk-import"

# Read org IDs from snyk-created-orgs.json
ORG_IDS=$(jq -r '.orgData[].orgId' snyk-created-orgs.json)

for org_id in $ORG_IDS; do
  echo "Syncing org: $org_id"
  snyk-api-import sync \
    --source=github \
    --orgPublicId="$org_id" || echo "Failed to sync $org_id"
done
```

### Kubernetes CronJob

See [ci-cd-examples.md](examples/ci-cd-examples.md#kubernetes-cronjob) for
Kubernetes manifests.

### GitHub Actions Workflow

See [ci-cd-examples.md](examples/ci-cd-examples.md#github-actions) for complete
workflow examples.

---

## Large-Scale Imports

### Managing Concurrency

The tool defaults to 10 concurrent imports. Adjust based on your needs:

```bash
# Lower concurrency for rate limit sensitivity
export IMPORT_CONCURRENCY=5
snyk-api-import import

# Or use CLI flag
snyk-api-import import --concurrency=5

# Higher concurrency (if you have high rate limits)
export IMPORT_CONCURRENCY=20
snyk-api-import import --concurrency=20
```

**Guidelines:**
- **GitHub PAT**: 5-10 concurrent
- **GitHub Cloud App**: 10-15 concurrent (better rate limits)
- **GitLab**: 8-12 concurrent
- **Bitbucket Cloud**: 5-8 concurrent
- **Azure DevOps**: 8-12 concurrent

**Note:** You can also set a default in `config.toml`:

```toml
[import]
concurrency = 10
```

### Splitting Large Imports

For very large repositories (200+ manifest files), split the import:

**Option 1: Split by Directory**

Manually create multiple target files:

```json
{
  "targets": [
    {
      "orgId": "org-123",
      "integrationId": "int-456",
      "target": {
        "name": "large-monorepo",
        "owner": "my-org",
        "branch": "main"
      },
      "files": [
        {"path": "services/service-a/package.json"},
        {"path": "services/service-b/package.json"}
      ]
    }
  ]
}
```

**Option 2: Use exclusionGlobs**

**Note:** To filter what gets imported, use the `--exclusionGlobs` flag during the `sync` command. The `import:data` command discovers all available manifests, and filtering happens at sync time.

### Monitoring Progress

**View Import Progress:**

```bash
# Watch imported projects count
watch -n 5 'jq -s length logs/<org-id>.imported-projects.log'

# View latest imports
tail -f logs/<org-id>.imported-projects.log | jq .
```

**Track Failed Imports:**

```bash
# Count failures
jq -s length logs/<org-id>.failed-imports.log

# View failure reasons
jq -r '.error' logs/<org-id>.failed-imports.log | sort | uniq -c
```

---

## Handling Failures

### Common Failure Scenarios

**1. Rate Limiting**

```
Error: API rate limit exceeded
```

**Solutions:**
- Reduce `IMPORT_CONCURRENCY` or use `--concurrency` flag
- Use GitHub Cloud App (better limits)
- Add delay between batches
- Spread imports across time

**2. Authentication Errors**

```
Error: 401 Unauthorized
```

**Solutions:**
- Verify token hasn't expired
- Check token has required scopes
- Ensure token is exported correctly

**3. Repository Access Issues**

```
Error: Repository not found or inaccessible
```

**Solutions:**
- Verify token has access to private repos
- Check repo wasn't deleted or archived
- For GitHub Cloud App, verify installation permissions

**4. Large File Timeouts**

```
Error: Request timeout
```

**Solutions:**
- Split large repos using `files` array
- Exclude large directories
- Increase timeout (if available)

### Retry Failed Imports

Extract failed projects and create a new targets file:

```bash
# Extract failed targets
jq -r '{orgId: .orgId, target: .target}' logs/<org-id>.failed-imports.log \
  > logs/retry-targets.json

# Wrap in targets array
echo '{"targets":' > logs/retry-import-targets.json
cat logs/retry-targets.json >> logs/retry-import-targets.json
echo '}' >> logs/retry-import-targets.json

# Retry import
snyk-api-import import --file=logs/retry-import-targets.json
```

### Debug Mode

Enable verbose logging:

```bash
export DEBUG=snyk*
snyk-api-import <command>

# Or for sync specifically
snyk-api-import sync --verbose --source=github --orgPublicId=<org-id>
```

---

## Advanced Configuration

### Custom Snyk API URL

For Snyk on-premise or custom deployments:

```bash
export SNYK_API=https://snyk.mycompany.com/api
snyk-api-import <command>
```

### Custom Log Directory

```bash
export SNYK_LOG_PATH=/var/log/snyk-import
snyk-api-import <command>
```

### Per-Environment Configuration

Use different configs for dev/staging/prod:

```bash
# Development
export SNYK_TOKEN=$SNYK_DEV_TOKEN
export GITHUB_TOKEN=$GITHUB_DEV_TOKEN
export SNYK_LOG_PATH=./logs/dev

# Production
export SNYK_TOKEN=$SNYK_PROD_TOKEN
export GITHUB_TOKEN=$GITHUB_PROD_TOKEN
export SNYK_LOG_PATH=/var/log/snyk-import/prod
```

### Integration-Specific Advanced Configs

**Azure DevOps URL Formats:**

```bash
# Modern format
export AZURE_BASE_URL=https://dev.azure.com/myorg

# Legacy VSTS format
export AZURE_BASE_URL=https://myorg.visualstudio.com
```

---

## Best Practices

### 1. Always Dry Run First

```bash
snyk-api-import sync --dryRun --source=github --orgPublicId=<org-id>
```

### 2. Monitor Logs Regularly

Set up log rotation and monitoring:

```bash
# Logrotate config
/var/log/snyk-import/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
}
```

### 3. Use Service Accounts

Never use personal tokens in production:
- Create dedicated service accounts
- Use GitHub Cloud Apps where possible
- Rotate tokens regularly

### 4. Test in Non-Production First

Always test new workflows in a dev/staging Snyk group first.

### 5. Document Your Workflow

Keep a runbook of:
- Cron schedules
- Environment variables
- Org/group mappings
- Escalation procedures

---

## Troubleshooting Checklist

- [ ] Are all required environment variables set?
- [ ] Do tokens have the correct scopes/permissions?
- [ ] Are tokens still valid (not expired)?
- [ ] Is `SNYK_LOG_PATH` writable?
- [ ] For hosted instances, is `--sourceUrl` correct?
- [ ] Are there any rate limiting errors in logs?
- [ ] Have you reviewed failed-*.log files?
- [ ] Is DEBUG mode enabled for troubleshooting?

For more help, see:
- [Getting Started Guide](getting-started.md)
- [Command Reference](command-reference.md)
- [FAQ in README](../README.md#faq)
