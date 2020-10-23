# To kick off an import
Any logs will be generated at `SNYK_LOG_PATH` directory.

### 1. Create the `import-projects.json` file:
  - `orgId` - Can be found in https://app.snyk.io/org/YOUR_ORG/manage/settings
  - `integrationId` - Can be found in Integrations menu for each SCM https://app.snyk.io/org/YOUR_ORG/manage/settings
  - `target`, `files`, `exclusionGlobs` - see our [Import API documentation](https://snyk.docs.apiary.io/#reference/integrations/import-projects/import) for more info.

  *Note*: For a repo that may have 200+ manifest files it is recommended to split this import into multiple by targeting specific files. Importing hundreds of files at once from 1 repo can cause the import to result in some errors/failures. Splitting it into to target some files, or some folders only will benefit from the re-tries and yield a smaller load on the source control management system being used. Populate the the `files` property to accomplish this in the import JSON.

  If you have any tests ot fixtures that should be ignored, please set the `exclusionGLobs` property:
  > a comma-separated list of up to 10 folder names to exclude from scanning. If not specified, it will default to "fixtures, tests, __tests__, node_modules". If an empty string is provided - no folders will be excluded


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
### 2. Set the env vars mentioned:
  - `SNYK_IMPORT_PATH`- the path to the import file
  - `SNYK_TOKEN` - your [Snyk api token](https://app.snyk.io/account)
  - `SNYK_LOG_PATH` - the path to folder where all logs should be saved,it is recommended creating a dedicated logs folder per import you have running. (Note: all logs will append)
  - `CONCURRENT_IMPORTS` (optional) defaults to 15 repos at a time, which is the recommended amount to import at once as a max.  Just 1 repo may have many projects inside which can trigger a many files at once to be requested from the user's SCM instance and some may have rate limiting in place. This script aims to help reduce the risk of hitting a rate limit.
  - `SNYK_API` (optional) defaults to `https://snyk.io/api/v1`

### 3. Download & run
Grab a binary from the [releases page](https://github.com/snyk-tech-services/snyk-api-import/releases) and run with `DEBUG=snyk* snyk-api-import-macos`

