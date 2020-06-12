![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

[![Known Vulnerabilities](https://snyk.io/test/github/snyk-tech-services/snyk-api-import/badge.svg)](https://snyk.io/test/github/snyk/snyk-api-import)

Snyk helps you find, fix and monitor for known vulnerabilities in your dependencies, both on an ad hoc basis and as part of your CI (Build) system.

## Snyk api import
Snyk API project importer


### Setup
`npm i`

### Running the test locally
You will need to set the following environment variable:
  - `SNYK_TOKEN_TEST` - snyk/orb (aka snyk/scan task in circle) uses `SNYK_TOKEN` and so does this lib, so overriding it in tests to avoid clash.
  - `SNYK_API='https://dev.snyk.io/api/v1'`
  - `SNYK_TOKEN` - check 1 Password (search for "snyk-api-import")

Run the tests with `npm test`


## To kick off an import
This script is intended to help import projects into Snyk with a controlled pace via API. The script will kick off an import in batches, wait for completion and then keep going. Failure logs will be generated at `SNYK_LOG_PATH` directory.
### 1. Create the `import-projects.json` file:
  `orgId` - Can be found in https://app.snyk.io/org/YOUR_ORG/manage/settings
  `integrationId` - Can be found in Integrations menu for each SCM https://app.snyk.io/org/YOUR_ORG/manage/settings


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
        }
      },
      {
        "orgId": "******,
        "integrationId": "******",
        "target": {
          "name": "shallow-goof-policy",
          "owner": "snyk-fixtures",
          "branch": "master"
        }
      },
    ]
  }
  ```
### 2. Set the env vars mentioned:
  - `SNYK_IMPORT_PATH`- the path to the import file
  - `SNYK_TOKEN` - your [Snyk api token](https://app.snyk.io/account)
  - `SNYK_LOG_PATH` - the path to folder where all logs should be saved
  - `CONCURRENT_IMPORTS` (optional) defaults to 5 repos at a time, which is the recommended amount to import at once as a max.  Just 1 repo may have many projects inside. (10 may also be okay if all repos are small)
  - `SNYK_API` (optional) defaults to `https://snyk.io/api/v1`

### 3. Install & run
`npm i -g snyk-api-import && DEBUG=snyk* snyk-api-import` or use one of the binaries
