![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

[![Known Vulnerabilities](https://snyk.io/test/github/snyk-tech-services/snyk-api-import/badge.svg)](https://snyk.io/test/github/snyk/snyk-api-import)

Snyk helps you find, fix and monitor for known vulnerabilities in your dependencies, both on an ad hoc basis and as part of your CI (Build) system.

## Snyk api import
Snyk API project importer. This script is intended to help import projects into Snyk with a controlled pace utilizing available [Snyk APIs](https://snyk.docs.apiary.io/) to avoid rate limiting from Github/Gitlab/Bitbucket etc and to provide a stable import. The script will kick off an import in batches, wait for completion and then keep going. Any failed requests will be retried before they are considered a failure and logged.

If you need to adjust concurrency you can stop the script, change the concurrency variable and start again. It will skip previous repos/targets that have been requested for import.

WHat you will need to have setup in advance:

- your Snyk organizations should be setup before running an import
- your Snyk organizations configured with some connection to SCM (Github/Gitlab/Bitbucket etc) as you will need the integrationId to generate the import files.
- Recommended: have notifications disabled for emails etc to avoid receiving import notifications
- Recommended: have the fix PRs and PR checks disabled until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)



### Setup
`npm i`

## To kick off an import
Any logs will be generated at `SNYK_LOG_PATH` directory.

### 1. Create the `import-projects.json` file:
  `orgId` - Can be found in https://app.snyk.io/org/YOUR_ORG/manage/settings
  `integrationId` - Can be found in Integrations menu for each SCM https://app.snyk.io/org/YOUR_ORG/manage/settings
  `target`, `files`, `exclusionGlobs` - see our [Import API documentation](https://snyk.docs.apiary.io/#reference/integrations/import-projects/import) for more info.

  Note: For a repo that may have 200+ manifest files it is recommended to split this import into multiple by targeting specific files. Importing hundreds of files at once from 1 repo can cause the import to result in some errors/failures. Splitting it into to target some files, or some folders only will benefit from the re-tries and yield a smaller load on the source control management system being used. use the `files` property to accomplish this.

  If you have any tests ot fixtures that should be ignored, please set the `exclusionGLobs` property:
  > a comma-separated list of up to 10 folder names to exclude from scanning. If not specified, it will default to "fixtures, tests, __tests__, node_modules". If an empty string is provided - no folders will be excluded


  ```
  {
    "targets": [
      {
        "orgId": "******,
        "integrationId": "******",
        "target": {
          "name": "shallow-goof-policy",
          "owner": "snyk-fixtures",
          "branch": "master"
        },
        "files": ["package.json", "package/package.json", "Gemfile.lock"]
      },
      {
        "orgId": "******,
        "integrationId": "******",
        "target": {
          "name": "shallow-goof-policy",
          "owner": "snyk-fixtures",
          "branch": "master"
        },
        exclusionGlobs: "fixtures, test"
      },
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
