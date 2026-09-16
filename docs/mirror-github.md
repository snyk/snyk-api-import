# GitHub & GitHub Enterprise

Import and sync GitHub.com and GitHub Enterprise repositories with Snyk.

**For complete setup instructions, see [Getting Started Guide](getting-started.md#github)**

## Quick Start

### GitHub.com

```bash
export GITHUB_TOKEN=ghp_your_token
export SNYK_TOKEN=your_snyk_token
export SNYK_LOG_PATH=./logs

snyk-api-import orgs:data --source=github --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-github-orgs.json
snyk-api-import import:data --source=github --orgsData=snyk-created-orgs.json
snyk-api-import import
```

### GitHub Enterprise Server

```bash
export GITHUB_TOKEN=ghp_your_token
export SNYK_TOKEN=your_snyk_token
export SNYK_LOG_PATH=./logs

snyk-api-import orgs:data \
  --source=github-enterprise \
  --sourceUrl=https://github.mycompany.com \
  --groupId=<group-id>

snyk-api-import orgs:create --file=group-<group-id>-github-enterprise-orgs.json
snyk-api-import import:data --source=github-enterprise --orgsData=snyk-created-orgs.json
snyk-api-import import
```

## Authentication

**Token Type:** Personal Access Token (PAT)

**Required Scopes:**

- `repo` - Full control of private repositories
- `read:org` - Read org and team membership

**Create Token:** GitHub Settings → Developer settings →
Personal access tokens → Tokens (classic)

See [Authentication Guide](authentication.md#github-authentication) for
detailed setup.

## Important Notes

### Personal vs Service Account Tokens

- **GitHub.com**: Use your personal Snyk API token (service accounts not
  supported for GitHub integration)
- **GitHub Enterprise**: Use a Snyk service account token

### Re-importing New Repositories

Use the `sync` command to automatically discover and import new repos:

```bash
snyk-api-import sync --source=github --orgPublicId=<org-id>
```

See [Advanced Workflows](advanced-workflows.md#re-importing-new-repositories)
for details.

## See Also

- [Getting Started Guide](getting-started.md#github) -
  Complete setup walkthrough
- [Authentication Guide](authentication.md#github-authentication) -
  Token creation
- [Command Reference](command-reference.md) - All available flags
- [Advanced Workflows](advanced-workflows.md) - Syncing and automation
- [GitHub Cloud App](github-cloud-app.md) - Alternative authentication method
