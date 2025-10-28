# Mirroring Bitbucket Cloud (App) organizations and repos in Snyk

This document explains how to use the Bitbucket Cloud _App_ (OAuth2 client credentials) flow with snyk-api-import.

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
