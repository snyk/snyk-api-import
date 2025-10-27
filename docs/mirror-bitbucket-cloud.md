# Mirroring Bitbucket Cloud organizations and repos in Snyk

This document shows the basic flow to import Bitbucket Cloud repositories into Snyk using the provided utilities.

## Prerequisites

- A Snyk API token: `export SNYK_TOKEN=...`
- Bitbucket Cloud credentials (one of the following — see [Authentication and env vars](#authentication-and-env-vars) below):
  - username + app password, or

## Quick import steps

1. Make sure the required environment variables are set (see examples below).
2. Generate organization data:

   `snyk-api-import orgs:data --source=bitbucket-cloud --groupId=<snyk_group_id>`

3. Create organizations in Snyk:

   `snyk-api-import orgs:create --file=orgs.json` — this produces `snyk-created-orgs.json` with Snyk org and integration IDs.

4. Generate import data for those orgs:

   `snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=bitbucket-cloud`

5. Run the import (use DEBUG for verbose output):

   `DEBUG=*snyk* snyk-api-import import`

## Periodic re-import (only new repos/orgs)

To periodically add new repositories that appear in Bitbucket Cloud:

1. Regenerate organization data and skip empty orgs:

   `snyk-api-import orgs:data --source=bitbucket-cloud --groupId=<snyk_group_id> --skipEmptyOrg`

2. Create any missing Snyk orgs (skip duplicates):

   `snyk-api-import orgs:create --file=orgs.json --noDuplicateNames`

3. Generate import data and run the import as above.

## Authentication and env vars

Supported Bitbucket Cloud auth methods (you may set multiple env vars; the tool will pick by precedence unless overridden):

- username + app password (needed for listing workspaces):
  - `BITBUCKET_CLOUD_USERNAME`
  - `BITBUCKET_CLOUD_PASSWORD` (app password)

## Notes

- Empty or whitespace-only env values are ignored.
- Default precedence when multiple credentials exist: API token -> OAuth token -> username/app password.
- Some operations (for example, listing workspaces) require username + app password. If a caller needs a specific method, code should request it explicitly; otherwise the app will use the precedence rule.
- You can force a specific method by setting:
  - `BITBUCKET_CLOUD_AUTH_METHOD=api|oauth|user`

## Examples

```bash
export BITBUCKET_CLOUD_USERNAME=myuser
export BITBUCKET_CLOUD_PASSWORD=myappassword
export SNYK_TOKEN=...
```

## Troubleshooting

- If workspace listing fails, ensure `BITBUCKET_CLOUD_USERNAME` and `BITBUCKET_CLOUD_PASSWORD` are set (workspace listing requires app-password Basic auth).
- If file listing or API calls return 401/403, check the token type and that the environment variable is non-empty (whitespace-only values are ignored).

For more detailed options and examples, see the linked docs in this repository (orgs.md, import-data.md, import.md).
