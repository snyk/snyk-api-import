# Creating Organizations in Snyk

Before an import can begin Snyk needs to be setup with the Organizations you will populate with projects.

It is recommended to have as many Organizations in Snyk as you have in the source you are importing from. So for Github this would mean mirroring the Github organizations in Snyk. The tool provides a utility that can be used to make this simpler when using Groups & Organizations in Snyk.

## `orgs:data`

### Github.com / Github Enterprise
1. set the [Github.com personal access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as an environment variable: `export GITHUB_TOKEN=your_personal_access_token`
2. Run the command to generate Org data:
 - **Github.com:** `snyk-api-import orgs:data --source=github --groupId=<snyk_group_id>`
 - **Github Enterprise:** `snyk-api-import orgs:data --source=github-enterprise --groupId=<snyk_group_id> -- sourceUrl=https://ghe.custom.github.com/`

3. Use the generated data to feed into Snyk [Orgs API](https://snyk.docs.apiary.io/#reference/groups/organizations-in-a-group/create-a-new-organization-in-a-group) to generate the organizations within a group.


## Recommendations
- have [notifications disabled](https://snyk.docs.apiary.io/#reference/organizations/notification-settings/set-notification-settings) for emails etc to avoid receiving import notifications
- have the [fix PRs and PR checks disabled](https://snyk.docs.apiary.io/#reference/integrations/integration-settings/update) until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)
