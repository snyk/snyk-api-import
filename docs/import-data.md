# Creating import targets data for import

This is a util that can help generate the import json data needed by the import command.

## Table of Contents
- Usage
  - [Github](#githubcom--github-enterprise)
  - [Gitlab](#gitlabcom--hosted-gitlab)
  - [Azure Repos](#devazurecom--hosted-azure)
  - [Bitbucket Server](#bitbucket-server)
  - [Bitbucket Cloud](#bitbucket-cloud)
- [Recommendations](#recommendations)


# `import:data`
## Github.com / Github Enterprise Server / Github Enterprise Cloud
1. set the [Github.com / Github Enterprise Server / Github Enterprise Cloud token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as an environment variable: `export GITHUB_TOKEN=your_personal_access_token`
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
  to list all repos belonging to that organization via Github API, the Snyk specific data accompanying that organization name will be used as the information to generate import data assuming all repos in that organization will be imported into a given Snyk organization. This is opinionated! If you want to customize this please manually craft the import data described in [import.md](/docs/import.md)
  - Github/Github Enterprise organizations can be listed using the [/orgs API](https://docs.github.com/en/free-pro-team@latest/rest/reference/orgs)
  - Integrations can be listed via [Snyk Integrations API](https://snyk.docs.apiary.io/#reference/integrations/integrations/list)
  - All organization IDs can be found by listing all organizations a group admin belongs to via [Snyk Organizations API](https://snyk.docs.apiary.io/#reference/groups/list-all-organizations-in-a-group/list-all-organizations-in-a-group)

3. Run the command to generate import data:
 - **Github.com:** `DEBUG=snyk* GITHUB_TOKEN=***  SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=github`
 - **Github Enterprise Server:** `DEBUG=snyk* GITHUB_TOKEN=***  SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=github-enterprise --sourceUrl=https://ghe.custom.com`
 - **Github Enterprise Cloud:** `DEBUG=snyk* GITHUB_TOKEN=***  SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=github-enterprise`

4. Use the generated data to feed into [import] command (/import.md) to generate kick off the import.

## Gitlab.com / Hosted Gitlab
1. set the [Gitlab personal access token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) as an environment variable: `export GITLAB_TOKEN=your_personal_access_token`
2. You will need to have the organizations data in json as an input to this command to help map Snyk organization IDs and Integration Ids that must be used during import against individual targets to be imported. The following format is required:
  ```
  {
    "orgData": [
      {
        "name": "<group_name_in_gitlab_used_to_list_repos>",
        "orgId": "<snyk_org_id>",
        "integrations": {
          "gitlab": "<snyk_org_integration_id>",
        },
      },
      {...}
    ]
  }
  ```
  Note: the "name" of the Gitlab Group is required in order to list all projects belonging to that Group via Gitlab API, the Snyk specific data accompanying that Group name will be used as the information to generate import data assuming all projects in that Group will be imported into a given Snyk organization. This is opinionated! If you want to customize this please manually craft the import data described in [import.md](/docs/import.md)
  - Gitlab Groups can be listed using the [/groups API](https://docs.gitlab.com/ee/api/groups.html)
  - Integrations can be listed via [Snyk Integrations API](https://snyk.docs.apiary.io/#reference/integrations/integrations/list)
  - All organization IDs can be found by listing all organizations a group admin belongs to via [Snyk Organizations API](https://snyk.docs.apiary.io/#reference/groups/list-all-organizations-in-a-group/list-all-organizations-in-a-group)

3. Run the command to generate import data:
 - **Gitlab.com:** `DEBUG=snyk* GITLAB_TOKEN=***  SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=gitlab `
 - **Hosted Gitlab:** `DEBUG=snyk* GITLAB_TOKEN=***  SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=gitlab --sourceUrl=https://gitlab.custom.com`

4. Use the generated data to feed into [import] command (/import.md) to generate kick off the import.


## dev.azure.com / Hosted Azure
*Please note that this tool uses Azure API version 4.1*
1. Set the [Azure personal access token](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=preview-page) as an environment variable: `export AZURE_TOKEN=your_personal_access_token`
2. You will need to have the organizations data in json as an input to this command to help map Snyk organization IDs and Integration Ids that must be used during import against individual targets to be imported. The following format is required:
  ```
  {
    "orgData": [
      {
        "name": "<org_name_in_azure_used_to_list_repos>",
        "orgId": "<snyk_org_id>",
        "integrations": {
          "azure-repos": "<snyk_org_integration_id>",
        },
      },
      {...}
    ]
  }
  ```
  Note: the "name" of the Azure Organization is required in order to list all projects and repos belonging to that Organization via Azure API, the Snyk specific data accompanying that Organization name will be used as the information to generate import data assuming all projects in that Organization will be imported into a given Snyk organization. This is opinionated! If you want to customize this please manually craft the import data described in [import.md](/docs/import.md)
  - Your Org name in Azure is listed on the left pane in the [Azure-Devops-site](https://dev.azure.com/)
  - Integrations can be listed via [Snyk Integrations API](https://snyk.docs.apiary.io/#reference/integrations/integrations/list)
  - All organization IDs can be found by listing all organizations a group admin belongs to via [Snyk Organizations API](https://snyk.docs.apiary.io/#reference/groups/list-all-organizations-in-a-group/list-all-organizations-in-a-group)

3. Run the command to generate import data:
 - **dev.azure.com:** `DEBUG=snyk* AZURE_TOKEN=*** SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=azure-repos`
 - **Hosted Azure:** `DEBUG=snyk* AZURE_TOKEN=***  SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=azure-repos --sourceUrl=https://azure.custom.com`

4. Use the generated data to feed into [import] command (/import.md) to generate kick off the import.


## Bitbucket Server
*Please note that this tool uses Bitbucket server API version 1.0*
1. Set the [Bitbucket Server personal access token](https://www.jetbrains.com/help/youtrack/standalone/integration-with-bitbucket-server.html#enable-youtrack-integration-bbserver) as an environment variable: `export BITBUCKET_SERVER_TOKEN=your_personal_access_token`
2. You will need to have the organizations data in json as an input to this command to help map Snyk organization IDs and Integration Ids that must be used during import against individual targets to be imported. The following format is required:
  ```
  {
    "orgData": [
      {
        "name": "<project_name_in_bitbucket_server_used_to_list_repos>",
        "orgId": "<snyk_org_id>",
        "integrations": {
          "bitbucket-server": "<snyk_org_integration_id>",
        },
      },
      {...}
    ]
  }
  ```
  Note: the "name" of the Bitbucket server project is required in order to list all repos belonging to that Project via Bibucket server API, the Snyk specific data accompanying that Project name will be used as the information to generate import data assuming all repos in that Project will be imported into a given Snyk organization. This is opinionated! If you want to customize this please manually craft the import data described in [import.md](/docs/import.md)
  - Bitbucket Server Projects can be listed using the [/projects API](https://docs.atlassian.com/bitbucket-server/rest/7.19.2/bitbucket-rest.html#:~:text=409%20%2D%20application/json%20(errors)%20%5Bexpand%5D-,GET,-/rest/api/1.0/projects%3Fname)
  - Integrations can be listed via [Snyk Integrations API](https://snyk.docs.apiary.io/#reference/integrations/integrations/list)
  - All organization IDs can be found by listing all organizations a group admin belongs to via [Snyk Organizations API](https://snyk.docs.apiary.io/#reference/groups/list-all-organizations-in-a-group/list-all-organizations-in-a-group)

3. Run the command to generate import data:
 - **Bitbucket Server:** `DEBUG=snyk* BITBUCKET_SERVER_TOKEN=*** SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=bitbucket-server --sourceUrl=https://bitbucket-server.dev.example.com`

4. Use the generated data to feed into [import] command (/import.md) to generate kick off the import.


## Bitbucket Cloud
*Please note that this tool uses Bitbucket Cloud API version 2.0*
1. Set the username and password credentials for your Bitbucket Cloud as environment variables:
```
export BITBUCKET_CLOUD_USERNAME=your_bitbucket_cloud_username
export BITBUCKET_CLOUD_PASSWORD=your_bitbucket_cloud_password
```
2. You will need to have the organizations data in json as an input to this command to help map Snyk organization IDs and Integration Ids that must be used during import against individual targets to be imported. The following format is required:
  ```
  {
    "orgData": [
      {
        "name": "<workspace_name_in_bitbucket_cloud_used_to_list_repos>",
        "orgId": "<snyk_org_id>",
        "integrations": {
          "bitbucket-cloud": "<snyk_org_integration_id>",
        },
      },
      {...}
    ]
  }
  ```
  Note: the "name" of the Bitbucket Cloud workspace is required in order to list all repos belonging to that workspace via Bibucket Cloud API, the Snyk specific data accompanying that workspace name will be used as the information to generate import data assuming all repos in that workspace will be imported into a given Snyk organization. This is opinionated! If you want to customize this please manually craft the import data described in [import.md](/docs/import.md)
  - Bitbucket Cloud workspaces can be listed using the [/workspaces API](https://bitbucket.org/api/2.0/workspaces)
  - Integrations can be listed via [Snyk Integrations API](https://snyk.docs.apiary.io/#reference/integrations/integrations/list)
  - All organization IDs can be found by listing all organizations a group admin belongs to via [Snyk Organizations API](https://snyk.docs.apiary.io/#reference/groups/list-all-organizations-in-a-group/list-all-organizations-in-a-group)

3. Run the command to generate import data:
 - **Bitbucket Cloud:** `DEBUG=snyk* BITBUCKET_CLOUD_USERNAME=*** BITBUCKET_CLOUD_PASSWORD=*** SNYK_TOKEN=*** npx snyk-api-import import:data --orgsData=path/to/snyk-orgs.json --source=bitbucket-cloud`

4. Use the generated data to feed into [import command](/import.md) to generate kick off the import.


## Recommendations
- have [notifications disabled](https://snyk.docs.apiary.io/#reference/organizations/notification-settings/set-notification-settings) for emails etc to avoid receiving import notifications
- have the [fix PRs and PR checks disabled](https://snyk.docs.apiary.io/#reference/integrations/integration-settings/update) until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)
