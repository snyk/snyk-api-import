# Mirroring Bitbucket Cloud (App) organizations and repos in Snyk

This document explains how to use the Bitbucket Cloud *App* (OAuth2 client credentials) flow with snyk-api-import.

Summary

- Use `--source=bitbucket-cloud-app` to operate in Cloud App mode.
- The tool performs an OAuth2 client_credentials exchange (client id/secret) to obtain a Bearer token for Bitbucket API calls.
- The app-scoped token is for Bitbucket API access only; it does not replace git credentials used by `git clone` over HTTPS.

Prerequisites

- A Bitbucket OAuth consumer (client ID + client secret) with permissions to list workspaces and read repositories.
- A Snyk API token: `export SNYK_TOKEN=...`

Required environment variables

- `BITBUCKET_APP_CLIENT_ID` — OAuth client ID (required)
- `BITBUCKET_APP_CLIENT_SECRET` — OAuth client secret (required)

  Note: This document assumes a confidential (private) Bitbucket Cloud App with a client secret. If you are using a public consumer, the client_credentials flow will fail. In that case, either:

  - Use the `bitbucket-cloud` source (interactive/app-password flows) for interactive workflows, or
  - Provision a confidential Bitbucket Cloud App (with a client secret) for non-interactive CI automation.

- `SNYK_TOKEN` — Snyk API token used for creating orgs and importing projects (required)
- `BITBUCKET_APP_API_BASE` — Optional: alternate Bitbucket API base URL (default: `https://api.bitbucket.org/2.0/`)

Quick workflow (Cloud App)

1. Export credentials:

```bash
export BITBUCKET_APP_CLIENT_ID=your_client_id
export BITBUCKET_APP_CLIENT_SECRET=your_client_secret
export SNYK_TOKEN=your_snyk_api_token
```

1. Generate Snyk organization data using the cloud-app source:

```bash
snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=<snyk_group_id>
```

1. Create organizations in Snyk using the generated orgs file:

```bash
snyk-api-import orgs:create --file=group-<groupId>-bitbucket-cloud-app-orgs.json
```

1. Generate import data and run import (same pattern as other sources):

```bash
snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=bitbucket-cloud-app
DEBUG=*snyk* snyk-api-import import
```

Permissions / scopes

- The OAuth consumer must have permission to list workspaces and read repositories. When creating the consumer in Bitbucket, grant the minimal read-only scopes required for these API operations.

Notes about cloning repositories

- The OAuth client_credentials token used by the cloud-app flow is not a drop-in replacement for git credentials. If the tool needs to `git clone` private repositories, provide separate git credentials (app password or SSH deploy key) or configure your CI's credential helper to supply them.
- Recommended approaches for private repo cloning:
  - Configure a CI or local git credential helper that provides an app-password for repository cloning over HTTPS.
  - Configure SSH deploy keys for repositories and ensure the environment running `snyk-api-import` has access to the corresponding SSH key.

Prefer SSH in CI

- You can force the tool to prefer SSH clone URLs (when available) by setting `BITBUCKET_USE_SSH=true` or by running the process with an active SSH agent (presence of `SSH_AUTH_SOCK`). When SSH is preferred and the repo metadata includes an `sshUrl`, `snyk-api-import` will use that URL for `git clone` instead of the HTTPS clone URL. This avoids embedding credentials into HTTPS clone URLs and leverages deploy keys or the SSH agent.

Example GitHub Actions snippet (using a deploy key):

```yaml
name: snyk-import
on: workflow_dispatch
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up SSH
        uses: webfactory/ssh-agent@v0.8.1
        with:
          ssh-private-key: ${{ secrets.DEPLOY_KEY }}

      - name: Run snyk-api-import (use SSH for clones)
        env:
          BITBUCKET_APP_CLIENT_ID: ${{ secrets.BITBUCKET_APP_CLIENT_ID }}
          BITBUCKET_APP_CLIENT_SECRET: ${{ secrets.BITBUCKET_APP_CLIENT_SECRET }}
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          BITBUCKET_USE_SSH: 'true'
        run: |
          snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=mygroup
          snyk-api-import import:data --source=bitbucket-cloud-app --orgsData=snyk-created-orgs.json
          snyk-api-import import
```

Troubleshooting

- 401 / 403 when calling Bitbucket API:
  - Verify `BITBUCKET_APP_CLIENT_ID` and `BITBUCKET_APP_CLIENT_SECRET` are correct.
  - Confirm the OAuth consumer has the necessary scopes and access to the target workspaces.
  - Enable debug logging: `DEBUG=*snyk*` to see the HTTP requests and responses.

- No workspaces or repos returned:
  - Confirm the app has been granted access to the expected workspaces.
  - Try a manual token exchange and API call to verify the client credentials flow:

```bash
# exchange client credentials for access token
curl -u "$BITBUCKET_APP_CLIENT_ID:$BITBUCKET_APP_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  https://bitbucket.org/site/oauth2/access_token

# list workspaces using the returned token
curl -H "Authorization: Bearer <access_token>" https://api.bitbucket.org/2.0/workspaces
```

Other notes

- Tokens obtained via client_credentials are cached briefly to avoid excessive token exchanges.
- The cloud-app source is intended for automation (service-to-service) use.
- If you need interactive or admin flows that require username + app-password, use the `bitbucket-cloud` source instead.
