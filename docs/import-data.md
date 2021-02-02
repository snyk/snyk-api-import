# Creating import targets data for import

This is a util that can help generate the import json data needed t=by the import command.

## `import:data`

### Github.com / Github Enterprise
1. set the [Github.com personal access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as an environment variable: `export GITHUB_TOKEN=your_personal_access_token`
2. You will need to have the organizations data in json as an input to this command to help map Snyk organization IDs and Integration Ids that must be used during import against individual targets to be imported. The following format is required:
  ```
  {
    "orgData": [
      {
        "name": "<org_name_in_gh_used_to_list_repos>",
        "orgId": "<snyk_org_id>",
        "integrations": {
          "github": "<snyk_org_integration_id>",
          "github-enterprise": "<snyk_org_integration_id>
        },
      },
      {...}
    ]
  }
  ```
  Note: the "name" of the Github/Github Enterprise organization is required in order
  to list all repos belonging to that organization via Github API, the Snyk specific data accompanying that organization name will be used as the information to genrate import data assuming all repos in that organization will be imported into a given Snyk organisation. This is opinionated! If you want to customise this please manually craft the import data described in [import.md](/docs/import.md)
  - Github/Github Enterprise organizations can be listed using the [/orgs API](https://docs.github.com/en/free-pro-team@latest/rest/reference/orgs)
  - Integrations can be listed via [Snyk Organizations API](https://snyk.docs.apiary.io/#reference/integrations/integrations/list)
  - All organization IDs can be found by listing all organizations a group admin belongs to via [Snyk API](https://snyk.docs.apiary.io/#reference/organizations/the-snyk-organization-for-a-request/list-all-the-organizations-a-user-belongs-to)

3. Run the command to generate import data:
 - **Github.com:** `DEBUG=snyk* GITHUB_TOKEN=***  SNYK_TOKEN=*** snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=github --integrationType=github`
 - **Github Enterprise:** `DEBUG=snyk* GITHUB_TOKEN=***  SNYK_TOKEN=*** snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=github-enterprise --integrationType=github-enterprise --sourceUrl=https://ghe.custom.com`

4. Use the generated data to feed into [import] command (/import.md) to generate kick off the import.


## Recommendations
- have [notifications disabled](https://snyk.docs.apiary.io/#reference/organizations/notification-settings/set-notification-settings) for emails etc to avoid receiving import notifications
- have the [fix PRs and PR checks disabled](https://snyk.docs.apiary.io/#reference/integrations/integration-settings/update) until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)
