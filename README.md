![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

[![Known Vulnerabilities](https://snyk.io/test/github/snyk-tech-services/snyk-api-import/badge.svg)](https://snyk.io/test/github/snyk/snyk-api-import)

Snyk helps you find, fix and monitor for known vulnerabilities in your dependencies, both on an ad hoc basis and as part of your CI (Build) system.

# Snyk api import
Snyk API project importer. This script is intended to help import projects into Snyk with a controlled pace utilizing available [Snyk APIs](https://snyk.docs.apiary.io/) to avoid rate limiting from Github/Gitlab/Bitbucket etc and to provide a stable import. The script will kick off an import in batches, wait for completion and then keep going. Any failed requests will be retried before they are considered a failure and logged.

If you need to adjust concurrency you can stop the script, change the concurrency variable and start again. It will skip previous repos/targets that have been requested for import.

What you will need to have setup in advance:
- your [Snyk organizations](docs/orgs.md) should be setup before running an import
- your Snyk organizations configured with some connection to SCM (Github/Gitlab/Bitbucket etc) as you will need the `integrationId` to generate the import files.
- Recommended: have [notifications disabled](https://snyk.docs.apiary.io/#reference/organizations/notification-settings/set-notification-settings) for emails etc to avoid receiving import notifications
- Recommended: have the [fix PRs and PR checks disabled](https://snyk.docs.apiary.io/#reference/integrations/integration-settings/update) until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)

# Usage
By default the `import` command will run if no command specified.
- `help` - show help & all available commands and their options
- `orgs:data` - generate data required to create Orgs via API.
- `import` - kick off a an API powered import of repos/targets into existing Snyk orgs defined in [import configuration file](./docs/import.md).
The logs can be explored using [Bunyan CLI](http://trentm.com/node-bunyan/bunyan.1.html)

# Table of Contents
- Utilities
  - [Generating orgs in Snyk](docs/orgs.md)
- [Kicking off an import](docs/import.md)
- [Contributing](.github/CONTRIBUTING.md)
