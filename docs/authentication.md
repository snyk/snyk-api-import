# Authentication Guide

This guide covers authentication methods for all supported integrations with
snyk-api-import.

## Table of Contents

- [Snyk Authentication](#snyk-authentication)
- [GitHub](#github-authentication)
- [GitHub Cloud App](#github-cloud-app-authentication)
- [GitLab](#gitlab-authentication)
- [Bitbucket Cloud](#bitbucket-cloud-authentication)
- [Bitbucket Cloud App](#bitbucket-cloud-app-authentication)
- [Bitbucket Server](#bitbucket-server-authentication)
- [Azure DevOps](#azure-devops-authentication)
- [Best Practices](#best-practices)

## Snyk Authentication

**Required for:** All operations

**Method:** API Token

### Getting Your Snyk API Token

1. Log in to [Snyk](https://app.snyk.io)
2. Navigate to Account Settings
3. Click "General" → "Auth Token"
4. Click "Generate" if you don't have one
5. Copy the token

### Setting the Token

```bash
export SNYK_TOKEN=your-snyk-api-token
```

**Important:** Use a Service Account token for production/CI environments, not
a personal token.

### Regional Endpoints

Snyk operates in multiple regions. The tool supports all regional endpoints:

| Region | API Endpoint | App URL |
|--------|--------------|---------|
| **US-01** (default) | `https://api.snyk.io` | `https://app.snyk.io` |
| **US-02** | `https://api.us.snyk.io` | `https://app.us.snyk.io` |
| **EU-01** | `https://api.eu.snyk.io` | `https://app.eu.snyk.io` |
| **AU-01** | `https://api.au.snyk.io` | `https://app.au.snyk.io` |

**Your token is region-specific** - ensure you use the correct API endpoint for your region.

#### Setting Regional Endpoint

**Option 1: Environment Variable**
```bash
# EU region example
export SNYK_API="https://api.eu.snyk.io"
export SNYK_TOKEN=your-eu-region-token

snyk-api-import import --source github
```

**Option 2: Config File**
```toml
[snyk]
token = "your-eu-region-token"
api_url = "https://api.eu.snyk.io"
```

**Option 3: Auto-detection** (default)
If neither `SNYK_API` nor `api_url` is set, the tool defaults to US-01 (`https://api.snyk.io`).

---

## GitHub Authentication

**Integration Types:** `github`, `github-enterprise`

**Method:** Personal Access Token (PAT)

### Creating a GitHub PAT

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token" → "Generate new token (classic)"
3. Set an expiration (90 days recommended)
4. Select scopes:
   - `repo` - Full control of private repositories
   - `read:org` - Read org and team membership

### Configure GitHub Token

```bash
export GITHUB_TOKEN=ghp_your_token_here

# For GitHub Enterprise Server
export GITHUB_ENTERPRISE_URL=https://github.mycompany.com
```

### Using GitHub PAT

```bash
# GitHub.com
snyk-api-import orgs:data --source=github --groupId=<group-id>

# GitHub Enterprise Server
snyk-api-import orgs:data \
  --source=github-enterprise \
  --sourceUrl=$GITHUB_ENTERPRISE_URL \
  --groupId=<group-id>
```

---

## GitHub Cloud App Authentication

**Integration Type:** `github-cloud-app`

**Method:** GitHub App Installation (JWT + Installation Token)

### Creating a GitHub App

1. Navigate to your GitHub organization settings
2. Go to Developer settings → GitHub Apps
3. Click "New GitHub App"
4. Fill in required information:
   - **App name**: `Snyk Import Tool` (or your choice)
   - **Homepage URL**: Your organization URL
   - **Webhook**: Leave inactive

5. Set permissions:
   - **Repository permissions:**
     - Contents: `Read`
     - Metadata: `Read`
   - **Organization permissions:**
     - Members: `Read`

6. Click "Create GitHub App"

### Installing the App

1. Click "Install App" on the app page
2. Select organization(s)
3. Choose:
   - **All repositories** (recommended), or
   - **Selected repositories**
4. Click "Install"

### Getting Credentials

1. Note the **App ID** (numeric value on app page)
2. Scroll to "Private keys"
3. Click "Generate a private key"
4. Download the `.pem` file
5. Note the **Installation ID** (optional, from installation URL)

### Setting Up Authentication

**Option 1: Environment Variables**

```bash
# Required: App ID
export GITHUB_APP_ID="123456"

# Required: Private key (multi-line)
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
... your key content ...
-----END RSA PRIVATE KEY-----"

# Optional but recommended: Specific installation ID
export GITHUB_APP_INSTALLATION_ID="789012"
```

**About `GITHUB_APP_INSTALLATION_ID`:**
- **Single installation:** Auto-discovered automatically (uses the only installation found)
- **Multiple installations:** Should be specified to ensure the correct organization is targeted
- **`orgs:data` command:** Not needed (discovers all installations automatically)
- **`sync`/`import` commands:** Recommended when you have multiple installations

To find your installation ID, visit your GitHub App settings or check the logs when running `orgs:data` - it will show all discovered installations.

**Alternative:** Load private key from file:

```bash
export GITHUB_APP_PRIVATE_KEY="$(cat /path/to/private-key.pem)"
```

**Option 2: config.toml (Recommended)**

```toml
[snyk]
token = "your-snyk-token"

[logging]
path = "./logs"

[integrations.github-cloud-app]
enabled = true
app_id = "123456"
installation_id = "789012"  # Optional
private_key_path = "/path/to/private-key.pem"
# Or use inline key:
# private_key = """-----BEGIN RSA PRIVATE KEY-----
# ...
# -----END RSA PRIVATE KEY-----"""
```

**Benefits of config.toml:**
- ✅ No need to export environment variables
- ✅ Easier to manage multiple integrations
- ✅ Can be version controlled (without secrets)
- ✅ Supports both file path and inline private key

### Benefits of GitHub Cloud App

- ✅ Better rate limits (5000 req/hour per installation vs 5000/hour for PAT)
- ✅ Automatic token rotation (1-hour lifecycle)
- ✅ Granular permissions
- ✅ Works with organizations that don't allow PATs
- ✅ Audit trail shows app actions separately from user actions

### Using GitHub Cloud App

```bash
# All commands support --source=github-cloud-app
snyk-api-import orgs:data --source=github-cloud-app --groupId=<group-id>
snyk-api-import sync --source=github-cloud-app --orgPublicId=<org-id>
snyk-api-import import --source=github-cloud-app
```

**Important:** When using `--source=github-cloud-app`, the tool will **only** use GitHub App credentials. It will not fall back to `GITHUB_TOKEN`. This ensures proper authentication separation between different GitHub integration types.
- ✅ Organization-level access control
- ✅ No user-tied credentials

---

## GitLab Authentication

**Integration Type:** `gitlab`

**Method:** Personal Access Token (PAT)

### Creating a GitLab PAT

1. Go to GitLab → User Settings → Access Tokens
2. Fill in:
   - **Token name**: `snyk-api-import`
   - **Expiration date**: 90 days recommended
3. Select scopes:
   - `api` - Full API access
   - `read_repository` - Read repository data
4. Click "Create personal access token"
5. Copy the token (shown only once)

### Configure GitLab Token

```bash
export GITLAB_TOKEN=glpat-your_token_here

# For self-managed GitLab
export GITLAB_BASE_URL=https://gitlab.mycompany.com
```

### Using GitLab PAT

```bash
# GitLab.com
snyk-api-import orgs:data --source=gitlab --groupId=<group-id>

# Self-managed GitLab
snyk-api-import orgs:data \
  --source=gitlab \
  --sourceUrl=$GITLAB_BASE_URL \
  --groupId=<group-id>
```

---

## Bitbucket Cloud Authentication

**Integration Type:** `bitbucket-cloud`

**Method:** Username + Atlassian API Token

### Creating an Atlassian API Token

**Note:** Bitbucket Cloud has deprecated app passwords in favor of
Atlassian API tokens.

1. Go to [Atlassian Account → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Fill in:
   - **Label**: `snyk-api-import`
4. Copy the generated token (shown only once)

### Bitbucket Cloud Token Scopes

- `read:account`
- `read:project:bitbucket`
- `read:repository:bitbucket`
- `read:workspace:bitbucket`
- `read:user:bitbucket`

### Configure Bitbucket Cloud Credentials

```bash
export BITBUCKET_CLOUD_USERNAME=your-username
export BITBUCKET_CLOUD_PASSWORD=your-api-token  # Use API token here
```

**Important:** Despite the variable name `BITBUCKET_CLOUD_PASSWORD`, you
must use your Atlassian API token (not a traditional password).

---

## Bitbucket Cloud App Authentication

**Integration Type:** `bitbucket-cloud-app`

**Method:** OAuth2 Client Credentials

### Creating a Bitbucket OAuth Consumer

1. Go to Bitbucket workspace Settings → OAuth consumers
2. Click "Add consumer"
3. Fill in:
   - **Name**: `Snyk Import Tool`
   - **Callback URL**: Not required for client_credentials flow
4. **Enable "This is a private consumer"** - This enables the
   client_credentials grant type
5. Select permissions (minimum required):
   - **Account**: Read
   - **Workspace membership**: Read
   - **Projects**: Read
   - **Repositories**: Read
6. Click "Save"
7. Copy the **Client ID** and **Client Secret**

**Important:** The consumer must be marked as "private" to use the
client_credentials grant type and receive a client secret.

### Configure Bitbucket Cloud App Credentials

```bash
export BITBUCKET_APP_CLIENT_ID=your-client-id
export BITBUCKET_APP_CLIENT_SECRET=your-client-secret
```

### How Bitbucket Cloud App Works

The tool uses the Bitbucket API and HTTPS to discover repositories and fetch
manifest files. No git cloning or SSH configuration is required.

---

## Bitbucket Server Authentication

**Integration Type:** `bitbucket-server`

**Method:** Personal Access Token (HTTP Access Token)

### Creating a Bitbucket Server Token

1. Go to Bitbucket Server → Profile → Personal access tokens
2. Click "Create a token"
3. Fill in:
   - **Token name**: `snyk-api-import`
   - **Expiration**: 90 days recommended
4. Select permissions:
   - **Projects**: `Read`
   - **Repositories**: `Read`
5. Click "Create"
6. Copy the token (shown only once)

### Configure Bitbucket Server Token

```bash
export BITBUCKET_SERVER_TOKEN=your-token
export BITBUCKET_SERVER_URL=https://bitbucket.mycompany.com
```

### Using Bitbucket Server PAT

```bash
snyk-api-import orgs:data \
  --source=bitbucket-server \
  --sourceUrl=$BITBUCKET_SERVER_URL \
  --groupId=<group-id>
```

---

## Azure DevOps Authentication

**Integration Type:** `azure-repos`

**Method:** Personal Access Token (PAT)

### Creating an Azure DevOps PAT

1. Go to Azure DevOps → User Settings → Personal access tokens
2. Click "New Token"
3. Fill in:
   - **Name**: `snyk-api-import`
   - **Organization**: Select appropriate scope
   - **Expiration**: 90 days recommended
4. Select scopes:
   - **Code**: `Read`
   - **Project and Team**: `Read`
   - **Identity**: `Read` (for auto-discovery)
5. Click "Create"
6. Copy the token (shown only once)

### Configure Azure DevOps Token

```bash
export AZURE_TOKEN=your-azure-pat

# Set base URL
export AZURE_BASE_URL=https://dev.azure.com/myorg
# OR for VSTS
export AZURE_BASE_URL=https://myorg.visualstudio.com
```

### Azure Organization Discovery

**Cloud Instances** (`dev.azure.com` or `*.visualstudio.com`):

- Auto-discovery is supported (requires `Identity: Read` scope)

**On-Premise Azure DevOps Server**:

- Auto-discovery not supported
- Use `--azureOrgs` to specify organizations manually

### Using Azure DevOps PAT

```bash
# Auto-discovery (cloud only)
snyk-api-import orgs:data --source=azure-repos --groupId=<group-id>

# Manual specification (on-premise or cloud)
snyk-api-import orgs:data \
  --source=azure-repos \
  --groupId=<group-id> \
  --azureOrgs=org1,org2,org3
```

---

## Best Practices

### Token Security

✅ **DO:**

- Use service accounts for production/CI
- Store tokens in secret managers (e.g., Vault, AWS Secrets Manager)
- Set token expiration dates
- Rotate tokens regularly (90 days)
- Use minimal required scopes
- Delete unused tokens immediately

❌ **DON'T:**

- Commit tokens to version control
- Share tokens via email/chat
- Use personal tokens in production
- Give tokens unnecessary permissions

### CI/CD Integration

Store credentials in your CI platform's secret manager:

**GitHub Actions:**

```yaml
env:
  SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**GitLab CI:**

```yaml
variables:
  SNYK_TOKEN: $SNYK_TOKEN
  GITLAB_TOKEN: $GITLAB_TOKEN
```

**Environment Variables:**

Use different tokens for different environments:

```bash
# Development
export SNYK_TOKEN=$SNYK_DEV_TOKEN

# Production
export SNYK_TOKEN=$SNYK_PROD_TOKEN
```

### Debugging Authentication

Enable debug logging to troubleshoot auth issues:

```bash
# Set before running commands
export DEBUG=snyk*

# Or for Go-specific debugging
snyk-api-import --verbose <command>
```

Common issues:

- **401 Unauthorized**: Token is invalid or expired
- **403 Forbidden**: Token lacks required permissions
- **404 Not Found**: Incorrect URL or inaccessible resource

### Token Scopes Quick Reference

| Integration | Required Scopes |
|-------------|-----------------|
| GitHub PAT | `repo`, `read:org` |
| GitHub App | Contents: Read, Metadata: Read, Members: Read |
| GitLab PAT | `api`, `read_repository` |
| Bitbucket Cloud | `read:account`, `read:project:bitbucket`, `read:repository:bitbucket`, `read:workspace:bitbucket`, `read:user:bitbucket` |
| Bitbucket Cloud App | Account: Read, Repositories: Read, Workspaces: Read |
| Bitbucket Server | Projects: Read, Repositories: Read |
| Azure DevOps | Code: Read, Project and Team: Read, Identity: Read (for auto-discovery) |

## Troubleshooting

### Self-Signed Certificates

If your SCM uses self-signed certificates:

```bash
# Add CA cert to system trust store (recommended)
# OR disable TLS verification (not recommended for production)
export SNYK_DISABLE_TLS_VERIFY=true
```

### Multiple Organizations/Accounts

If you work with multiple Snyk orgs or SCM accounts:

```bash
# Create separate credential sets
export SNYK_PROD_TOKEN=...
export SNYK_DEV_TOKEN=...
export GITHUB_PROD_TOKEN=...
export GITHUB_DEV_TOKEN=...

# Switch between them
export SNYK_TOKEN=$SNYK_PROD_TOKEN
export GITHUB_TOKEN=$GITHUB_PROD_TOKEN
```

### Testing Authentication

Verify your credentials before running imports:

```bash
# Test Snyk token
curl -H "Authorization: token $SNYK_TOKEN" https://api.snyk.io/v1/user/me

# Test GitHub token
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Test GitLab token
curl -H "PRIVATE-TOKEN: $GITLAB_TOKEN" https://gitlab.com/api/v4/user

# Test Azure token
curl -u ":$AZURE_TOKEN" https://dev.azure.com/<org>/_apis/projects?api-version=6.0
```

For more help, see [Getting Started Guide](getting-started.md)
