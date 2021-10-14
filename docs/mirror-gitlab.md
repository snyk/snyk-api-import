# Mirroring Gitlab organizations and repos in Snyk
In order to import the entirety of Gitlab repos into Snyk you can use the available utils to make it possible in 4 commands.
You will need to configure both Gitlab token and Snyk token as environment variable to proceed.
Please refer to individual documentation pages for more detailed info, however the general steps are:

1. `export GITLAB_TOKEN=***` and `export SNYK_TOKEN=***`
2. Generate organization data e.g. `snyk-api-import orgs:data --source=gitlab --groupId=<snyk_group_id>` [Full instructions](./orgs.md)
3. Create organizations in Snyk `snyk-api-import orgs:create --file=orgs.json` [Full instructions](./orgs.md) will create a `snyk-created-orgs.json` file with Snyk organization ids and integration ids that are needed for import.
4. Generate import data `snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=gitlab --integrationType=gitlab` [Full instructions](./import-data.md)
5. Run import `DEBUG=*snyk* snyk-api-import import`[Full instructions](./import.md)

## Re-importing new repos & orgs only while Mirroring
Not yet supported.
