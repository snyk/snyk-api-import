![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

[![Known Vulnerabilities](https://snyk.io/test/github/snyk-tech-services/snyk-api-import/badge.svg)](https://snyk.io/test/github/snyk/snyk-api-import)

Snyk helps you find, fix and monitor for known vulnerabilities in your dependencies, both on an ad hoc basis and as part of your CI (Build) system.

# snyk-api-import
Snyk API project importer. This script is intended to help import projects into Snyk with a controlled pace utilizing available [Snyk APIs](https://snyk.docs.apiary.io/) to avoid rate limiting from Github/Gitlab/Bitbucket etc and to provide a stable import. The script will kick off an import in batches, wait for completion and then keep going. Any failed requests will be retried before they are considered a failure and logged.

If you need to adjust concurrency you can stop the script, change the concurrency variable and start again. It will skip previous repos/targets that have been requested for import.

What you will need to have setup in advance:
- your [Snyk organizations](docs/orgs.md) should be setup before running an import
- your Snyk organizations configured with some connection to SCM (Github/Gitlab/Bitbucket etc) as you will need the `integrationId` to generate the import files.
- Recommended: have [notifications disabled](https://snyk.docs.apiary.io/#reference/organizations/notification-settings/set-notification-settings) for emails etc to avoid receiving import notifications
- Recommended: have the [fix PRs and PR checks disabled](https://snyk.docs.apiary.io/#reference/integrations/integration-settings/update) until import is complete to avoid sending extra requests to SCMs (Github/Gitlab/Bitbucket etc)

# Installation
Snyk snyk-api-import CLI can be installed through multiple channels.

## Standalone executables (macOS, Linux, Windows)

Use [GitHub Releases](https://github.com/snyk-tech-services/snyk-api-import/releases) to download a standalone executable of Snyk CLI for your platform.

## More installation methods

<details>
  <summary>Install with npm or Yarn</summary>

### Install with npm or Yarn

[Snyk snyk-api-import CLI is available as an npm package](https://www.npmjs.com/package/snyk-api-import). If you have Node.js installed locally, you can install it by running:

```bash
npm install snyk-api-import@latest -g
```

or if you are using Yarn:

```bash
yarn global add snyk-api-import
```

</details>

# Usage
By default the `import` command will run if no command specified.
- `import` - kick off a an API powered import of repos/targets into existing Snyk orgs defined in [import configuration file](./docs/import.md).
- `help` - show help & all available commands and their options
- `orgs:data` - util generate data required to create Orgs via API.
- `orgs:create` - util to create the Orgs in Snyk based on data file generated with `orgs:data` command.
- `import:data` - util to generate data required to kick off an import.
- `list:imported` - util to generate data to help skip previously imported targets during import.

The logs can be explored using [Bunyan CLI](http://trentm.com/node-bunyan/bunyan.1.html)

# Table of Contents
- Utilities
  - [Creating orgs in Snyk](docs/orgs.md)
  - [Generating import data](docs/import-data.md)
  - [Mirroring Github.com/Github Enterprise organizations & repos in Snyk](docs/mirror-github.md)
  - [Mirroring Gitlab organizations & repos in Snyk](docs/mirror-gitlab.md)
  - [Mirroring Bitbucket Server organizations & repos in Snyk](docs/mirror-bitbucket-server.md)
  - [Mirroring Bitbucket Cloud organizations & repos in Snyk](docs/mirror-bitbucket-cloud.md)

- [Kicking off an import](docs/import.md)
- [Contributing](.github/CONTRIBUTING.md)

# FAQ
<details>
<summary><code>Error: ENFILE: file table overflow, open</code> or <code>Error: EMFILE, too many open files</code></summary>
<br/>
  <p>If you see these errors then you may need to bump <b>ulimit</b> to allow more open file operations. In order to keep the operations more performant tool logs as soon as it is convenient rather than wait until very end of a loop and log a huge data structure. This means depending on number of concurrent imports set the tool may exceed the system default <b>ulimit</b>.</p>
  <p>Some of these resources may help you bump the <b>ulimit</b>:</p>
  <ul>
    <li><a href="https://ss64.com/bash/ulimit.html">ss64.com</a></li>
    <li><a href="https://stackoverflow.com/questions/45004352/error-enfile-file-table-overflow-scandir-while-run-reaction-on-mac">StackOverflow</a></li>
    <li><a href="http://blog.mact.me/2014/10/22/yosemite-upgrade-changes-open-file-limit">blog.mact.me</a></li>
  </ul>
</details>
<details>
<summary>Does this work with brokered integrations?</summary>
<br/>
  <p>
    Yes. because we reuse the existing integration with your SCM (git) repository to perform the imports, the brokered connection will be used when configured.
  </p>
</details>

