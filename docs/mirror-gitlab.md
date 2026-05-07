# GitLab

Import and sync GitLab.com and self-managed GitLab repositories with Snyk.

**For complete setup instructions, see [Getting Started Guide](getting-started.md#gitlab)**

## Quick Start

### GitLab.com

```bash
export GITLAB_TOKEN=glpat-your_token
export SNYK_TOKEN=your_snyk_token
export SNYK_LOG_PATH=./logs

snyk-api-import orgs:data --source=gitlab --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-gitlab-orgs.json
snyk-api-import import:data --source=gitlab --orgsData=snyk-created-orgs.json
snyk-api-import import
```

### Self-Managed GitLab

```bash
export GITLAB_TOKEN=glpat-your_token
export GITLAB_BASE_URL=https://gitlab.mycompany.com
export SNYK_TOKEN=your_snyk_token
export SNYK_LOG_PATH=./logs

snyk-api-import orgs:data \
  --source=gitlab \
  --sourceUrl=$GITLAB_BASE_URL \
  --groupId=<group-id>

snyk-api-import orgs:create --file=group-<group-id>-gitlab-orgs.json
snyk-api-import import:data --source=gitlab --sourceUrl=$GITLAB_BASE_URL --orgsData=snyk-created-orgs.json
snyk-api-import import
```

## Authentication

**Token Type:** Personal Access Token (PAT)

**Required Scopes:**

- `api` - Full API access
- `read_repository` - Read repository data

**Create Token:** GitLab → User Settings → Access Tokens

See [Authentication Guide](authentication.md#gitlab-authentication) for
detailed setup.

## GitLab Groups

The tool imports GitLab **Groups** as Snyk Organizations. Both top-level
groups and subgroups are supported.

## Re-importing New Repositories

Use the `sync` command to automatically discover and import new repos:

```bash
snyk-api-import sync --source=gitlab --orgPublicId=<org-id>
```

See [Advanced Workflows](advanced-workflows.md#re-importing-new-repositories)
for details.

## See Also

- [Getting Started Guide](getting-started.md#gitlab) -
  Complete setup walkthrough
- [Authentication Guide](authentication.md#gitlab-authentication) -
  Token creation
- [Command Reference](command-reference.md) - All available flags
- [Advanced Workflows](advanced-workflows.md) - Syncing and automation
