# Getting Started with Snyk API Import

This guide will walk you through importing repositories from your source control
system into Snyk.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Basic Workflow](#basic-workflow)
- [Integration-Specific Setup](#integration-specific-setup)
  - [GitHub](#github)
  - [GitHub Cloud App](#github-cloud-app)
  - [GitLab](#gitlab)
  - [Bitbucket Cloud](#bitbucket-cloud)
  - [Bitbucket Cloud App](#bitbucket-cloud-app)
  - [Bitbucket Server](#bitbucket-server)
  - [Azure DevOps](#azure-devops)
- [Next Steps](#next-steps)

## Prerequisites

1. **Snyk Account**: You need a Snyk account with a Group created
2. **Snyk API Token**: Generate one at <https://app.snyk.io/account>
3. **SCM Access**: Personal access token or app credentials for your source
   control system
4. **snyk-api-import CLI**: Installed from releases or built from source

### Set Required Environment Variables

```bash
export SNYK_TOKEN=your-snyk-api-token
export SNYK_LOG_PATH=./logs
```

## Basic Workflow

The import process follows these 4 steps for all integrations:

```mermaid
graph LR
    A[1. Generate Org Data] --> B[2. Create Orgs]
    B --> C[3. Generate Import Targets]
    C --> D[4. Run Import]
```

### Step 1: Generate Organization Data

This command discovers organizations in your SCM and creates a data file:

```bash
snyk-api-import orgs:data \
  --source=<integration-type> \
  --groupId=<your-snyk-group-id>
```

**Output:** `group-<groupId>-<source>-orgs.json`

### Step 2: Create Organizations in Snyk

Create matching organizations in Snyk based on your SCM structure:

```bash
snyk-api-import orgs:create \
  --file=group-<groupId>-<source>-orgs.json
```

**Output:** `snyk-created-orgs.json`

### Step 3: Generate Import Targets

Generate a list of repositories to import:

```bash
snyk-api-import import:data \
  --source=<integration-type> \
  --orgsData=snyk-created-orgs.json
```

**Output:** `<source>-import-targets.json`

### Step 4: Run the Import

Import all repositories into Snyk:

```bash
snyk-api-import import
```

The tool will automatically find and use the generated targets file in
`SNYK_LOG_PATH`.

## Integration-Specific Setup

### GitHub

**Authentication:** Personal Access Token (PAT)

**Required Scopes:** `repo`, `read:org`

**Setup:**

```bash
export GITHUB_TOKEN=ghp_your_token_here
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
# For GitHub.com
snyk-api-import orgs:data --source=github --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-github-orgs.json
snyk-api-import import:data --source=github --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**For GitHub Enterprise Server:**

Add `--sourceUrl` with your GitHub Enterprise URL:

```bash
export GITHUB_ENTERPRISE_URL=https://github.mycompany.com
snyk-api-import orgs:data \
  --source=github-enterprise \
  --sourceUrl=$GITHUB_ENTERPRISE_URL \
  --groupId=<group-id>
```

**See also:** [mirror-github.md](mirror-github.md) for detailed GitHub setup

---

### GitHub Cloud App

**Authentication:** GitHub App Installation

**Required Permissions:**

- Repository Contents: Read
- Repository Metadata: Read
- Organization Members: Read

**Setup:**

```bash
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...your key...
-----END RSA PRIVATE KEY-----"
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
snyk-api-import orgs:data --source=github-cloud-app --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-github-cloud-app-orgs.json
snyk-api-import import:data --source=github-cloud-app --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**See also:** [github-cloud-app.md](github-cloud-app.md) for detailed GitHub
App setup

---

### GitLab

**Authentication:** Personal Access Token (PAT)

**Required Scopes:** `api`, `read_repository`

**Setup:**

```bash
export GITLAB_TOKEN=glpat-your_token_here
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
# For GitLab.com
snyk-api-import orgs:data --source=gitlab --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-gitlab-orgs.json
snyk-api-import import:data --source=gitlab --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**For Self-Managed GitLab:**

Add `--sourceUrl` with your GitLab URL:

```bash
export GITLAB_BASE_URL=https://gitlab.mycompany.com
snyk-api-import orgs:data \
  --source=gitlab \
  --sourceUrl=$GITLAB_BASE_URL \
  --groupId=<group-id>
```

**See also:** [mirror-gitlab.md](mirror-gitlab.md)

---

### Bitbucket Cloud

**Authentication:** Username + Atlassian API Token

**Required API Token Scopes:**

`read:account`, `read:project:bitbucket`, `read:repository:bitbucket`,
`read:workspace:bitbucket`, `read:user:bitbucket`

**Create Token:**
[Atlassian Account → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

**Note:** Bitbucket Cloud uses Atlassian API tokens (also called "App Passwords" in Atlassian's interface).

**Setup:**

```bash
export BITBUCKET_CLOUD_USERNAME=your-username
export BITBUCKET_CLOUD_PASSWORD=your-api-token  # Use API token here
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
snyk-api-import orgs:data --source=bitbucket-cloud --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-bitbucket-cloud-orgs.json
snyk-api-import import:data --source=bitbucket-cloud --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**See also:** [mirror-bitbucket-cloud.md](mirror-bitbucket-cloud.md)

---

### Bitbucket Cloud App

**Authentication:** OAuth2 Client Credentials (private consumer)

**Required Permissions:** Account: Read, Workspace membership: Read,
Projects: Read, Repositories: Read

**Note:** The OAuth consumer must be marked as "private" to enable the
client_credentials grant type.

**Setup:**

```bash
export BITBUCKET_APP_CLIENT_ID=your-client-id
export BITBUCKET_APP_CLIENT_SECRET=your-client-secret
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-bitbucket-cloud-app-orgs.json
snyk-api-import import:data --source=bitbucket-cloud-app --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**See also:** [mirror-bitbucket-cloud-app.md](mirror-bitbucket-cloud-app.md)

---

### Bitbucket Server

**Authentication:** Personal Access Token (PAT)

**Required Permissions:** `PROJECT_READ`, `REPO_READ`

**Setup:**

```bash
export BITBUCKET_SERVER_TOKEN=your-token
export BITBUCKET_SERVER_URL=https://bitbucket.mycompany.com
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
snyk-api-import orgs:data \
  --source=bitbucket-server \
  --sourceUrl=$BITBUCKET_SERVER_URL \
  --groupId=<group-id>

snyk-api-import orgs:create --file=group-<group-id>-bitbucket-server-orgs.json
snyk-api-import import:data --source=bitbucket-server --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**See also:** [mirror-bitbucket-server.md](mirror-bitbucket-server.md)

---

### Azure DevOps

**Authentication:** Personal Access Token (PAT)

**Required Scopes:** `Code (Read)`, `Project and Team (Read)`

**Setup:**

```bash
export AZURE_TOKEN=your-azure-pat
export AZURE_BASE_URL=https://dev.azure.com/myorg  # or https://myorg.visualstudio.com
export SNYK_TOKEN=your-snyk-token
```

**Commands:**

```bash
# The tool will auto-discover organizations for cloud instances
snyk-api-import orgs:data --source=azure-repos --groupId=<group-id>

# Or manually specify organizations (required for on-premise/VSTS)
snyk-api-import orgs:data \
  --source=azure-repos \
  --groupId=<group-id> \
  --azureOrgs=org1,org2,org3

snyk-api-import orgs:create --file=group-<group-id>-azure-repos-orgs.json
snyk-api-import import:data --source=azure-repos --orgsData=snyk-created-orgs.json
snyk-api-import import
```

**Note:** Auto-discovery works for `dev.azure.com` and cloud-based
`*.visualstudio.com` URLs. For on-premise Azure DevOps Server, use
`--azureOrgs` to manually specify organizations.

---

## Next Steps

After your initial import:

1. **Review Import Logs**: Check `SNYK_LOG_PATH` for detailed results

   ```bash
   jq . logs/<org-id>.imported-projects.log
   ```

2. **Set Up Sync**: Keep Snyk projects in sync with your SCM

   - See [advanced-workflows.md](advanced-workflows.md#syncing-projects)

3. **Automate in CI/CD**: Set up periodic imports

   - See [examples/ci-cd-examples.md](examples/ci-cd-examples.md)

4. **Re-Import New Repos**: Periodically check for new repositories
   - See [advanced-workflows.md](advanced-workflows.md#re-importing-new-repositories)

## Common Options

### Skip Empty Organizations

Skip organizations/groups that have no repositories:

```bash
snyk-api-import orgs:data \
  --source=<source> \
  --groupId=<group-id> \
  --skipEmptyOrgs
```

### Copy Organization Settings

Copy settings from an existing Snyk org to new orgs:

```bash
snyk-api-import orgs:data \
  --source=<source> \
  --groupId=<group-id> \
  --sourceOrgPublicId=<template-org-id>
```

## Troubleshooting

### Import Failures

Check the logs:

- `<org-id>.failed-imports.log` - Import attempts that failed (includes retry details)
- `<org-id>.import-job-results.log` - Detailed import job status and results

### Rate Limiting

If you hit rate limits:

1. Reduce concurrent imports (default is 10):
   ```bash
   export IMPORT_CONCURRENCY=5
   # or use CLI flag
   snyk-api-import import --concurrency=5
   ```
2. Use GitHub Cloud App for better rate limits (5000 req/hour vs 5000 req/hour for PAT)
3. Consider using `config.toml` to set a permanent default concurrency

### Authentication Issues

- Verify tokens have correct scopes/permissions
- Check token expiration
- For GitHub Enterprise/GitLab self-hosted, verify `--sourceUrl` is correct

For more help, see [FAQ in README](../README.md#faq)
