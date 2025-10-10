# Mirroring Bitbucket Cloud (App) organizations and repos in Snyk

This document describes how to use the Bitbucket Cloud *App* (OAuth client credentials) flow with snyk-api-import.
The `bitbucket-cloud-app` source uses an OAuth2 client credentials exchange to obtain a Bearer token and performs app-scoped calls to the Bitbucket Cloud API.

Important: The Cloud App flow is separate from the standard token / app-password flows. Use `--source=bitbucket-cloud-app` on the CLI to choose this behavior.

## Environment variables

Set these environment variables before running the CLI commands below.

- `BITBUCKET_APP_CLIENT_ID` — OAuth consumer/client id (required)
- `BITBUCKET_APP_CLIENT_SECRET` — OAuth consumer/client secret (required)
- `BITBUCKET_APP_API_BASE` — Optional. Custom Bitbucket API base (default: `https://api.bitbucket.org/2.0`). Useful for proxies or VPC setups.
- `SNYK_TOKEN` — Your Snyk API token used by the tool to create orgs and import projects (required for import/create operations).

Note: If you previously used `BITBUCKET_CLOUD_USERNAME` + `BITBUCKET_CLOUD_PASSWORD` or `BITBUCKET_CLOUD_API_TOKEN` those are different authentication mechanisms and will not be automatically used by the cloud-app flow.

## Permissions / Scopes

When you create the OAuth consumer (app) in Bitbucket, ensure that it has permission to read workspaces and repositories. The exact permission names may vary over time; configure the OAuth consumer such that the app can list workspaces and read repository metadata.

If in doubt, create a test consumer that has read-only repository access and verify calls using curl (see Troubleshooting below).

## Typical workflow (4 steps)

1. Export required environment variables:

```bash
export BITBUCKET_APP_CLIENT_ID=your_client_id
export BITBUCKET_APP_CLIENT_SECRET=your_client_secret
export SNYK_TOKEN=your_snyk_api_token
```

1. Generate organization data (list workspaces / org discovery). Use `--source=bitbucket-cloud-app`:

```bash
# writes group-<groupId>-bitbucket-cloud-app-orgs.json
snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=<snyk_group_id>
```

1. Create organizations in Snyk (uses the orgs file created above):

```bash
snyk-api-import orgs:create --file=group-<groupId>-bitbucket-cloud-app-orgs.json
```

1. Generate import data (list repos and assemble import targets) and run import:

```bash
# generate import-targets using the bitbucket-cloud-app source
snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=bitbucket-cloud-app

# run the import (use DEBUG for verbose logging)
DEBUG=*snyk* snyk-api-import import
```

## Troubleshooting

- 401 / authentication errors:
  - Ensure `BITBUCKET_APP_CLIENT_ID` and `BITBUCKET_APP_CLIENT_SECRET` are correct.
  - Check that the OAuth consumer has the right permissions to list workspaces and repositories.
  - Use `DEBUG=*snyk*` to see the HTTP requests made by the tool and the exact Bitbucket API responses.

- No workspaces returned:
  - Confirm the app has access to the workspaces you'd expect (Bitbucket admin UI).
  - Try a manual token exchange and API call to make sure the client credentials flow works:

```bash
# exchange client credentials for access token
curl -u "$BITBUCKET_APP_CLIENT_ID:$BITBUCKET_APP_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  https://bitbucket.org/site/oauth2/access_token

# list workspaces using the returned access_token
curl -H "Authorization: Bearer <access_token>" https://api.bitbucket.org/2.0/workspaces
```

## Notes and tips

- The cloud-app flow uses a transient Bearer token obtained via OAuth2 client-credentials. Tokens are cached briefly to avoid excessive token requests.
- The `bitbucket-cloud-app` source is intended for automation (service-to-service) integrations where a client ID/secret is available and scoped appropriately.
- If you need to use a username + app-password flow instead (interactive / admin scenarios), use the `bitbucket-cloud` source and the appropriate environment variables (`BITBUCKET_CLOUD_USERNAME`, `BITBUCKET_CLOUD_PASSWORD`) instead.

## Clone URLs and HTTPS

- For `bitbucket-cloud-app` targets the tool prefers HTTPS clone URLs by default (for example: `https://bitbucket.org/workspace/repo.git`) to avoid requiring SSH deploy keys in environments where SSH keys are harder to manage.
- Note: HTTPS clones may require credentials to access private repositories. Because the cloud-app flow provides an OAuth client_credentials token for API calls (not for git over HTTPS), you should provide Git credentials for cloning when necessary. Common approaches:
  - Use a CI/git credential helper that supplies a username and app-password when performing `git clone` over HTTPS.
  - Configure a service account with an app-password and set up the credential helper or environment so `git` can use it during `sync`.
  - If you prefer SSH-based cloning (deploy keys), you can still configure deploy keys on the repositories and the tool will use the `sshUrl` from metadata when available.
- Without appropriate clone credentials (HTTPS or SSH), `sync` will be unable to clone repositories and will fail; use `DEBUG=*snyk*` to inspect clone errors.

If you'd like, I can add an example CI snippet (GitHub Actions or CircleCI) that shows how to run the orgs/import steps with secrets stored in the CI environment.
