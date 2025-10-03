# Mirroring Bitbucket Cloud organizations and repos in Snyk
In order to import the entirety of Bitbucket Cloud repos into Snyk you can use the available utils to make it possible in 4 commands.
You will need to configure Bitbucket Cloud authentication and Snyk token as environment variables. Bitbucket Cloud supports three authentication methods:

- **API Token**: `export BITBUCKET_CLOUD_API_TOKEN=***`
- **OAuth Token**: `export BITBUCKET_CLOUD_OAUTH_TOKEN=***`
- **Username & App Password**: `export BITBUCKET_CLOUD_USERNAME=***` and `export BITBUCKET_CLOUD_PASSWORD=***`

> **Note:** Workspace listing (org discovery) requires username and app password. Repo import and other API calls support all three methods.
Please refer to individual documentation pages for more detailed info, however the general steps are:

1. Set your Bitbucket Cloud authentication and Snyk token as environment variables. For workspace listing, you must set `BITBUCKET_CLOUD_USERNAME` and `BITBUCKET_CLOUD_PASSWORD`. For repo import, you may use any supported method.
	- `export BITBUCKET_CLOUD_API_TOKEN=***` (for API token)
	- `export BITBUCKET_CLOUD_OAUTH_TOKEN=***` (for OAuth token)
	- `export BITBUCKET_CLOUD_USERNAME=***` and `export BITBUCKET_CLOUD_PASSWORD=***` (for app password)
	- `export SNYK_TOKEN=***`
2. Generate organization data (workspace listing):
	- Requires username and app password.
	- `snyk-api-import orgs:data --source=bitbucket-cloud --groupId=<snyk_group_id>` [Full instructions](./orgs.md)
3. Create organizations in Snyk `snyk-api-import orgs:create --file=orgs.json` [Full instructions](./orgs.md) will create a `snyk-created-orgs.json` file with Snyk organization ids and integration ids that are needed for import.
4. Generate import data (repo listing):
	- Supports API token, OAuth token, or username/app password.
	- `snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=bitbucket-cloud` [Full instructions](./import-data.md)
5. Run import `DEBUG=*snyk* snyk-api-import import`[Full instructions](./import.md)

## Re-importing new repos & orgs only while Mirroring
Once initial import is complete you may want to periodically check for new repos and make sure they are added into Snyk. To do this a similar flow to what is described above with a few small changes can be used:
1. Set your Bitbucket Cloud authentication and Snyk token as environment variables. For workspace listing, you must set `BITBUCKET_CLOUD_USERNAME` and `BITBUCKET_CLOUD_PASSWORD`. For repo import, you may use any supported method.
2. Generate organization data in Snyk and skip any that do not have any repos via `--skipEmptyOrg`:
	- Requires username and app password.
	- `snyk-api-import orgs:data --source=bitbucket-cloud --groupId=<snyk_group_id> --skipEmptyOrg` [Full instructions](./orgs.md)
3. Create organizations in Snyk and this time skip any that have been created already with `--noDuplicateNames` parameter `snyk-api-import orgs:create --file=orgs.json --noDuplicateNames` [Full instructions](./orgs.md) will create a `snyk-created-orgs.json` file with Snyk organization ids and integration ids that are needed for import.
4. Generate import data (repo listing):
	- Supports API token, OAuth token, or username/app password.
	- `snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=bitbucket-cloud` [Full instructions](./import-data.md)
5. Optional. Generate the previously imported log to skip all previously imported repos a Group (see full [documentation](./import.md#to-skip-all-previously-imported-targets)):
`snyk-api-import-macos list:imported --integrationType=<integration-type> --groupId=<snyk_group_id>`
6. Run import `DEBUG=*snyk* snyk-api-import import` [Full instructions](./import.md)