# Bitbucket Cloud

Import and sync Bitbucket Cloud repositories with Snyk using Atlassian API tokens.

**For OAuth2 authentication, see [Bitbucket Cloud App](mirror-bitbucket-cloud-app.md)**

**For complete setup instructions, see [Getting Started Guide](getting-started.md#bitbucket-cloud)**

## Quick Start

```bash
export BITBUCKET_CLOUD_USERNAME=your-username
export BITBUCKET_CLOUD_PASSWORD=your-api-token  # This is your API token, not a password
export SNYK_TOKEN=your_snyk_token
export SNYK_LOG_PATH=./logs

snyk-api-import orgs:data --source=bitbucket-cloud --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-bitbucket-cloud-orgs.json
snyk-api-import import:data --source=bitbucket-cloud --orgsData=snyk-created-orgs.json
snyk-api-import import
```

## Authentication

**Method:** Username + Atlassian API Token

**Required API Token Scopes:**

- `read:account`
- `read:project:bitbucket`
- `read:repository:bitbucket`
- `read:workspace:bitbucket`
- `read:user:bitbucket`

**Create API Token:**
[Atlassian Account → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

**Important:** Despite the environment variable name `BITBUCKET_CLOUD_PASSWORD`,
you must use an Atlassian API token (not the legacy app password).

See [Authentication Guide](authentication.md#bitbucket-cloud-authentication)
for detailed setup.

## Important Notes

### Workspace Listing

Listing workspaces requires authentication with `BITBUCKET_CLOUD_USERNAME` and
`BITBUCKET_CLOUD_PASSWORD` (containing your Atlassian API token).

### Re-importing New Repositories

Use the `sync` command to automatically discover and import new repos:

```bash
snyk-api-import sync \
  --source=bitbucket-cloud \
  --orgPublicId=<org-id>
```

See [Advanced Workflows](advanced-workflows.md#re-importing-new-repositories)
for details.

## See Also

- [Getting Started Guide](getting-started.md#bitbucket-cloud) -
  Complete setup walkthrough
- [Authentication Guide](authentication.md#bitbucket-cloud-authentication) -
  Token creation
- [Bitbucket Cloud App](mirror-bitbucket-cloud-app.md) -
  OAuth2 client credentials flow
- [Command Reference](command-reference.md) - All available flags
- [Advanced Workflows](advanced-workflows.md) - Syncing and automation
