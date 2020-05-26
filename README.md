![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

[![Known Vulnerabilities](https://snyk.io/test/github/snyk/snyk-api-import/badge.svg)](https://snyk.io/test/github/snyk/snyk-api-import)

Snyk helps you find, fix and monitor for known vulnerabilities in your dependencies, both on an ad hoc basis and as part of your CI (Build) system.

## Snyk api import
Snyk API project importer


### Setup
`npm i`

### Running the test locally
You will need to set the following environment variable:
  - `SNYK_API_TOKEN` - check 1 Password (search for "snyk-api-import")
  - `SNYK_HOST='https://dev.snyk.io'`

Run the tests with `npm test`


### Running the script
- `SNYK_HOST`
- `SNYK_API_TOKEN` - your [Snyk api token](https://app.snyk.io/account)
- `SNYK_LOG_PATH` - the path to folder where all logs should be saved
- `CONCURRENT_IMPORTS` (optional) defaults to 5 which is the recommended amount to import at once as a max.


