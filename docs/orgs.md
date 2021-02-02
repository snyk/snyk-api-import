# Creating Organizations in Snyk

Before an import can begin Snyk needs to be setup with the Organizations you will populate with projects.

It is recommended to have as many Organizations in Snyk as you have in the source you are importing from. So for Github this would mean mirroring the Github organizations in Snyk. The tool provides a utility that can be used to make this simpler when using Groups & Organizations in Snyk.

## Generating the data required to create Organizations in Snyk

### using `orgs:data` util
This util helps generate data needed to mirror the Github.com / Github Enterprise organization structure in Snyk.
This is an opinionated util and will assume every organization in Github.com / Github Enterprise should become an organization in Snyk. If this is not what you are looking for, please look at using the [Orgs API](https://snyk.docs.apiary.io/#reference/groups/organizations-in-a-group/create-a-new-organization-in-a-group) directly to create the structure you need.

#### Github.com / Github Enterprise
1. set the [Github.com personal access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as an environment variable: `export GITHUB_TOKEN=your_personal_access_token`
2. Run the command to generate Org data:
 - **Github.com:** `snyk-api-import orgs:data --source=github --groupId=<snyk_group_id>`
 - **Github Enterprise:** `snyk-api-import orgs:data --source=github-enterprise --groupId=<snyk_group_id> -- sourceUrl=https://ghe.custom.github.com/`

This will create the organization data in a file `group-<snyk_group_id>-github-<com|enterprise>-orgs.json`

## Creating Organizations in Snyk
Use the generated data file to help create the organizations via API or use the provided util.
### via API
Use the generated data to feed into Snyk [Orgs API](https://snyk.docs.apiary.io/#reference/groups/organizations-in-a-group/create-a-new-organization-in-a-group) to generate the organizations within a group.

### via `orgs:create` util
1. set the `SNYK_TOKEN` environment variable - your [Snyk api token](https://app.snyk.io/account)
2. Run the command to create Orgs:
`snyk-api-import orgs:create --file=group-<snyk_group_id>-github-<com|enterprise>-orgs.json`


## Recommendations
- have [notifications disabled](https://snyk.docs.apiary.io/#reference/organizations/notification-settings/set-notification-settings) for emails etc to avoid receiving import notifications
- have the [fix PRs and PR checks disabled](https://snyk.docs.apiary.io/#reference/integrations/integration-settings/update) until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)
