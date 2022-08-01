# Mirroring Github.com / Github Enterprise organizations and repos in Snyk

You will need your Snyk API token, with correct scope & [admin access for all Organizations](https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets) you are importing to. As Github is both an auth & integration, how the integration is done has an effect on usage: 
  - For users importing via [Github Snyk integration](https://docs.snyk.io/integrations/git-repository-scm-integrations/github-integration#setting-up-a-github-integration) use your **personal Snyk API token** (Service Accounts are not supported for Github integration imports via API as this is a personal auth token only accessible to the user)
  - For Github Enterprise Snyk integration with a url & token (for Github.com, Github Enterprise Cloud & Github Enterprise hosted) use a **Snyk API service account token**

In order to import the entirety of Github/Github Enterprise repos into Snyk you can use the available utils to make it possible in 4 commands.
You will need to configure both Github token and Snyk token as environment variable to proceed.
Please refer to individual documentation pages for more detailed info, however the general steps are:

1. `export GITHUB_TOKEN=***` and `export SNYK_TOKEN=***`
2. Generate organization data e.g. `snyk-api-import orgs:data --source=github --groupId=<snyk_group_id>` [Full instructions](./orgs.md)
3. Create organizations in Snyk `snyk-api-import orgs:create --file=orgs.json` [Full instructions](./orgs.md) will create a `snyk-created-orgs.json` file with Snyk organization ids and integration ids that are needed for import.
4. Generate import data `snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=github --integrationType=github` [Full instructions](./import-data.md)
5. Run import `DEBUG=*snyk* snyk-api-import import`[Full instructions](./import.md)

## Re-importing new repos & organizations only while mirroring
Once initial import is complete you may want to periodically check for new repos and make sure they are added into Snyk. To do this a similar flow to what is described above with a few small changes can be used:
1. `export GITHUB_TOKEN=***` and `export SNYK_TOKEN=***`
2. Generate organization data in Snyk and skip any that do not have any repos via `--skipEmptyOrg` `snyk-api-import orgs:data --source=github --groupId=<snyk_group_id> --skipEmptyOrg` [Full instructions](./orgs.md)
3. Create organizations in Snyk and this time skip any that have been created already with `--noDuplicateNames` parameter `snyk-api-import orgs:create --file=orgs.json --noDuplicateNames` [Full instructions](./orgs.md) will create a `snyk-created-orgs.json` file with Snyk organization ids and integration ids that are needed for import.
4. Generate import data `snyk-api-import import:data --orgsData=snyk-created-orgs.json --source=github --integrationType=github` [Full instructions](./import-data.md)
5. Optional. Generate the previously imported log to skip all previously imported repos a Group (see full [documentation](./import.md#to-skip-all-previously-imported-targets)):
`snyk-api-import-macos list:imported --integrationType=<integration-type> --groupId=<snyk_group_id>`
6. Run import `DEBUG=*snyk* snyk-api-import import`[Full instructions](./import.md)
