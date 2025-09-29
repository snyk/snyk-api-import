![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

[![Known Vulnerabilities](https://snyk.io/test/github/snyk/snyk-api-import/badge.svg)](https://snyk.io/test/github/snyk/snyk-api-import)
[![Inactively Maintained](https://img.shields.io/badge/Maintenance%20Level-Inactively%20Maintained-yellowgreen.svg)](https://gist.github.com/cheerfulstoic/d107229326a01ff0f333a1d3476e068d)

**This repository is in maintenance mode, no new features are being developed. Bug & security fixes will continue to be delivered. Open source contributions are welcome for small features & fixes (no breaking changes)**

Snyk helps you find, fix and monitor for known vulnerabilities in your dependencies, both on an ad hoc basis and as part of your CI (Build) system.

# snyk-api-import
Snyk API project importer. This script is intended to help import projects into Snyk with a controlled pace utilizing available [Snyk APIs](https://snyk.docs.apiary.io/).

What does it offer?
- `rate limiting handling` - the script will pace requests to avoid rate limiting from Github/Gitlab/Bitbucket etc and to provide a stable import.
- `queue` - requests to Snyk are queued to reduce failures.
- `retries` - the script will kick off an import in batches, wait for completion and then keep going. Any failed requests will be retried before they are considered a failure and logged.

If you need to adjust concurrency you can stop the script, change the concurrency variable and start again. It will skip previous repos/targets that have been requested for import.

# Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [FAQ](#faq)
- Utilities
  - [Creating orgs in Snyk](docs/orgs.md)
  - [Generating import data](docs/import-data.md)
  - [Mirroring Github.com/Github Enterprise organizations & repos in Snyk](docs/mirror-github.md)
  - [GitHub Cloud App Integration](#github-cloud-app-integration)
  - [Mirroring Gitlab organizations & repos in Snyk](docs/mirror-gitlab.md)
  - [Mirroring Bitbucket Server organizations & repos in Snyk](docs/mirror-bitbucket-server.md)
  - [Mirroring Bitbucket Cloud organizations & repos in Snyk](docs/mirror-bitbucket-cloud.md)

- [Contributing](.github/CONTRIBUTING.md)
- [Kicking off an import](docs/import.md)
- [Sync: detecting changes in monitored repos and updating Snyk projects](docs/sync.md)

- Example workflows
  - [AWS automation example](docs/example-workflows/aws-automation-example.md)

# Installation
`snyk-api-import` CLI can be installed through multiple channels.

## Standalone executables (macOS, Linux, Windows)

Use [GitHub Releases](https://github.com/snyk/snyk-api-import/releases) to download a standalone executable of Snyk CLI for your platform.

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
- `import` - kick off a an API powered import of repos/targets into existing Snyk orgs defined in [import configuration file](./docs/import.md). 100% support available for all project types supported via [Import API](https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets).
- `help` - show help & all available commands and their options
- `orgs:data` - util generate data required to create Orgs via API.
- `orgs:create` - util to create the Orgs in Snyk based on data file generated with `orgs:data` command.
- `import:data` - util to generate data required to kick off an import.
- `list:imported` - util to generate data to help skip previously imported targets during import.

The logs can be explored using [Bunyan CLI](http://trentm.com/node-bunyan/bunyan.1.html)

# GitHub Cloud App Integration

The snyk-api-import tool now supports GitHub Cloud App authentication, providing enhanced security and functionality compared to traditional Personal Access Tokens.

## Key Benefits

- **Enhanced Security**: Uses GitHub App authentication with JWT tokens and installation tokens
- **Higher Rate Limits**: 5000 requests/hour per installation (vs per user)
- **Granular Permissions**: Repository access controlled at the GitHub App installation level
- **Role-Based Access Control**: Application-level permissions instead of user-level

## Setup Requirements

### 1. Create a GitHub App

1. Go to your organization's GitHub settings
2. Navigate to "Developer settings" → "GitHub Apps"
3. Click "New GitHub App"
4. Configure the following settings:
   - **App name**: Choose a descriptive name (e.g., "Snyk Import Tool")
   - **Homepage URL**: Your organization's website
   - **Webhook URL**: Leave empty (not required for this integration)
   - **Repository permissions**:
     - Contents: Read
     - Metadata: Read
     - Pull requests: Read
     - Issues: Read
   - **Organization permissions**:
     - Members: Read
   - **Subscribe to events**: Leave empty (not required)

### 2. Install the GitHub App

1. After creating the app, install it on your target organization(s)
2. Note the **App ID** from the app settings
3. Generate a **private key** and download it (PEM format)

### 3. Configure Environment Variables

Set the following environment variables:

```bash
export GITHUB_APP_ID="your-app-id"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
your-private-key-content-here
-----END RSA PRIVATE KEY-----"
```

**Optional**: If you want to target a specific installation:
```bash
export GITHUB_APP_INSTALLATION_ID="your-installation-id"
```

### 4. Usage

Use `github-cloud-app` as the source type in your commands:

```bash
# 1. Generate organization data
snyk-api-import orgs:data --source=github-cloud-app --groupId=your-group-id

# Optional: Use an existing Snyk organization as a template for settings
snyk-api-import orgs:data --source=github-cloud-app --groupId=your-group-id --sourceOrgPublicId=your-template-org-id

# 2. Create organizations in Snyk
snyk-api-import orgs:create --file=group-your-group-id-github-cloud-app-orgs.json

# 3. Set up GitHub Cloud App integration in each organization
# IMPORTANT: You must manually configure the GitHub Cloud App integration in each 
# organization through the Snyk UI or API before proceeding to step 4.
# Go to each organization in Snyk and add the GitHub Cloud App integration.

# 4. Generate import targets
snyk-api-import import:data --source=github-cloud-app --orgsData=orgs-data.json

# 5. Sync projects
snyk-api-import sync --source=github-cloud-app --orgPublicId=your-org-id
```

## Security Considerations

- **Private Key Storage**: Store the private key securely and never commit it to version control
- **Token Rotation**: GitHub App installation tokens are automatically rotated every hour
- **Minimal Permissions**: The app only requests read permissions for repository metadata and contents
- **Organization Scope**: Access is limited to organizations where the app is installed

## Troubleshooting

### Common Issues

1. **"GITHUB_APP_ID environment variable is required"**
   - Ensure `GITHUB_APP_ID` is set to your GitHub App's numeric ID

2. **"GITHUB_APP_PRIVATE_KEY must be in PEM format"**
   - Ensure the private key includes the full PEM headers and is properly formatted

3. **"Failed to authenticate with GitHub App"**
   - Verify the app is installed on the target organization
   - Check that the private key matches the app
   - Ensure the app has the required permissions

4. **"No organizations found"**
   - Verify the app is installed on organizations (not just users)
   - Check that the app has access to the repositories you want to import

5. **"Missing integrationId in import targets"**
   - Ensure you have set up the GitHub Cloud App integration in each Snyk organization
   - The integration must be configured through the Snyk UI before running `import:data`
   - Check that the integration appears in the organization's integrations list

### Debug Mode

Run with debug logging to get more detailed error information:

```bash
DEBUG=snyk* snyk-api-import orgs:data --source=github-cloud-app --groupId=your-group-id
```

# FAQ
<details>
<summary>What is the minimum version of Node that the tool supports?</summary>
<br/>
  <p>Please check the <code>.nvmrc</code> file for the supported version of Node.</p>
</details>
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
<summary><code>ERROR: HttpError: request to https://github.private.com failed, reason: self signed certificate in certificate chain</code></summary>
<br/>
  <p>If your Github / Gitlab / Bitbucket / Azure is using a self signed certificate, you can configure snyk-api-import to use this certificate when calling the HTTPS APIs.</p>
  <code>export NODE_EXTRA_CA_CERTS=./path-to-ca</code>
</details>
<details>
<summary>Does this work with brokered integrations?</summary>
<br/>
  <p>
    Yes. because we reuse the existing integration with your SCM (git) repository to perform the imports, the brokered connection will be used when configured.
  </p>
</details>
<details>
<summary>What is supported for import command?</summary>
<br/>
  <p>
    snyk-api-import supports 100% of the same integration types and project sources as the <a href="https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets">Import API documentation</a>. If an example is not in the docs for your use case please see the API documentation
  </p>
</details>
