# Bitbucket Cloud App (OAuth2)

Import and sync Bitbucket Cloud repositories using OAuth2 client credentials
(recommended for CI/CD and automation).

**For username/API token auth, see [Bitbucket Cloud](mirror-bitbucket-cloud.md)**

**For complete setup instructions, see [Getting Started Guide](getting-started.md#bitbucket-cloud-app)**

## Quick Start

```bash
export BITBUCKET_APP_CLIENT_ID=your-client-id
export BITBUCKET_APP_CLIENT_SECRET=your-client-secret
export SNYK_TOKEN=your_snyk_token
export SNYK_LOG_PATH=./logs

snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=<group-id>
snyk-api-import orgs:create --file=group-<group-id>-bitbucket-cloud-app-orgs.json
snyk-api-import import:data --source=bitbucket-cloud-app --orgsData=snyk-created-orgs.json
snyk-api-import import
```

## Authentication

**Method:** OAuth2 Client Credentials (private consumer)

**Required:** Bitbucket OAuth Consumer with client secret

### Creating the OAuth Consumer

1. Go to your Bitbucket workspace Settings → OAuth consumers
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

See [Authentication Guide](authentication.md#bitbucket-cloud-app-authentication)
for detailed setup.

## How It Works

The tool uses the Bitbucket API and HTTPS to:

1. Discover workspaces and repositories via OAuth2
2. Fetch repository metadata and manifest files via API
3. Import projects to Snyk using the Snyk Import API

No git cloning or SSH configuration is required.

## CI/CD Example

```yaml
# GitHub Actions
- name: Run snyk-api-import
  env:
    BITBUCKET_APP_CLIENT_ID: ${{ secrets.BITBUCKET_APP_CLIENT_ID }}
    BITBUCKET_APP_CLIENT_SECRET: ${{ secrets.BITBUCKET_APP_CLIENT_SECRET }}
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  run: |
    snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=<group-id>
    snyk-api-import orgs:create --file=group-<group-id>-bitbucket-cloud-app-orgs.json
    snyk-api-import import:data --source=bitbucket-cloud-app --orgsData=snyk-created-orgs.json
    snyk-api-import import
```

## Re-importing New Repositories

Use the `sync` command to automatically discover and import new repos:

```bash
snyk-api-import sync --source=bitbucket-cloud-app --orgPublicId=<org-id>
```

See [Advanced Workflows](advanced-workflows.md#re-importing-new-repositories)
for details.

## Troubleshooting

### 401/403 Errors

- Verify `BITBUCKET_APP_CLIENT_ID` and `BITBUCKET_APP_CLIENT_SECRET` are correct
- Ensure the OAuth consumer has required scopes
- Confirm the consumer has access to target workspaces

### No Workspaces Returned

Test the OAuth flow manually:

```bash
# Get access token
curl -u "$BITBUCKET_APP_CLIENT_ID:$BITBUCKET_APP_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  https://bitbucket.org/site/oauth2/access_token

# List workspaces
curl -H "Authorization: Bearer <token>" \
  https://api.bitbucket.org/2.0/workspaces
```

### API Access Issues

- Verify the OAuth consumer is marked as "private"
- Confirm the consumer has the required read permissions
- Check that the consumer has access to the target workspaces
- Ensure Client ID and Client Secret are correct

## See Also

- [Getting Started Guide](getting-started.md#bitbucket-cloud-app) -
  Complete setup walkthrough
- [Authentication Guide](authentication.md#bitbucket-cloud-app-authentication) -
  OAuth consumer setup
- [Bitbucket Cloud](mirror-bitbucket-cloud.md) -
  Username/API token alternative
- [Command Reference](command-reference.md) - All available flags
- [Advanced Workflows](advanced-workflows.md) - Syncing and automation
- [CI/CD Examples](examples/ci-cd-examples.md) -
  Complete automation examples
