# To kick off an import
Any logs will be generated at `SNYK_LOG_PATH` directory.

### 1. Create the `import-projects.json` file

The file is expected to have a **required** `targets` top level key which is an array of **import targets**. 
```
{
  targets: [
    {..},
    {..}
  ],
}
```

Each **import target** has the following keys:
```
{
  // required
  "orgId": "<public_snyk_org_id>",
  "integrationId": <"public_snyk_integration_id>",
  "target": {..} // the identifier of where the projects can be found (for example branch, repo name and owner for Github)
   
   // optional
  "files": [], 
  "exclusionGlobs": [],

}
```
  - `orgId` - Can be found in https://app.snyk.io/org/YOUR_ORG/manage/settings
  - `integrationId` - Can be found in Integrations menu for each SCM https://app.snyk.io/org/YOUR_ORG/manage/settings
  - `target`, `files`, `exclusionGlobs` - see our [Import API documentation](https://snyk.docs.apiary.io/#reference/integrations/import-projects/import) for more info.

  *Note*: For a repo that may have 200+ manifest files it is recommended to split this import into multiple by targeting specific files. Importing hundreds of files at once from 1 repo can cause the import to result in some errors/failures. 

Splitting it to target some files, or some folders only will benefit from the re-tries and yield a smaller load on the source control management system being used. Populate the the `files` property to accomplish this in the import JSON.

  If you have any tests ot fixtures that should be ignored, please set the `exclusionGLobs` property:
  > a comma-separated list of up to 10 folder names to exclude from scanning. If not specified, it will default to "fixtures, tests, __tests__, node_modules". If an empty string is provided - no folders will be excluded

#### Example: Gitlab

```
{
  "targets": [
    {
      "orgId": "******",
      "integrationId": "******",
      "target": {
        "id": 13,
        "branch": "master"
      },
    },
    {
      "orgId": "******",
      "integrationId": "******",
      "target": {
        "id": 2,
        "branch": "master"
      },
    },
  ]
}

```


#### Example:  Bitbucket Server

```
{
  "targets": [
    {
      "orgId": "******",
      "integrationId": "******",
      "target": {
        "repoSlug": "snyk-fixtures",
        "name": "Snyk snyk-fixtures",
        "projectKey": "PROJECT"
      },
      "files": [
        {
          "path": "package.json"
        },
        {
          "path": "package/package.json"
        },
        {
          "path": "Gemfile.lock"
        }
      ],
      "exclusionGlobs": "fixtures, test"
    },
  ]
}
```

#### Example: Github.com | Github Enterprise
```
{
  "targets": [
    {
      "orgId": "******",
      "integrationId": "******",
      "target": {
        "name": "shallow-goof-policy",
        "owner": "snyk-fixtures",
        "branch": "master"
      },
      "exclusionGlobs": "fixtures, test"
    }
  ]
}
```
### 2. Set the env vars:
  - `SNYK_IMPORT_PATH`- the path to the import file
  - `SNYK_TOKEN` - your [Snyk api token](https://app.snyk.io/account)
  - `SNYK_LOG_PATH` - the path to folder where all logs should be saved,it is recommended creating a dedicated logs folder per import you have running. (Note: all logs will append)
  - `CONCURRENT_IMPORTS` (optional) defaults to 15 repos at a time, which is the recommended amount to import at once as a max.  Just 1 repo may have many projects inside which can trigger a many files at once to be requested from the user's SCM instance and some may have rate limiting in place. This script aims to help reduce the risk of hitting a rate limit.
  - `SNYK_API` (optional) defaults to `https://snyk.io/api/v1`

### 3. Download & run
Grab a binary from the [releases page](https://github.com/snyk-tech-services/snyk-api-import/releases) and run with `DEBUG=snyk* snyk-api-import-macos`

## To skip all previously imported targets
This can be used to skip previously imported targets (repos) so only remaining targets will be imported.

This utility helps generate the `imported-targets.log` file by analysing the projects already in a given Snyk Group. When present in the logging path this file is used to look up targets that should be skipped during the import.

Example:
- all Github repos have been imported into Snyk into their respective organizations during initial onboarding
- new Github repos have since been added and now need to be added to Snyk
- to avoid importing everything again, using this util and running import again provides a way to only import "new" Github repos. This is much much faster and removes unnecessary calls to Snyk & Github to fetch files and do the import for everything again.

Note:
- The same target imported into a different organization will be allowed to be imported
- The same target (but different branch) will be allowed to be imported
- The same target from a differed source be allowed to be imported (For example the same repo is present in Github and now it being imported via Github Enterprise into the same org)


Command to run:
- skip all previously imported into all orgs in a Group:
`snyk-api-import-macos list:imported --integrationType=<integration-type> --groupId=<snyk_group_id>`
- skip all previously imported for a specific Organization:
`snyk-api-import-macos list:imported --integrationType=<integration-type> --orgId=<snyk_org_id>`
- a single integration / projects source `snyk-api-import-macos list:imported --integrationType=<integration-type> --groupId=<snyk_group_id>`
-  multiple integrations / projects sources `snyk-api-import-macos list:imported --integrationType=<integration-type> --integrationType=<integration-type> --orgId=<snyk_org_id>`

Supported integration types:
- Github.com `github`
- Github Enterprise `github-enterprise`
- Bitbucket Cloud `bitbucket-cloud`
- Google Cloud Registry `gcr`
- DockerHub registry `docker-hub`
