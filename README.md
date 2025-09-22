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

# Bitbucket Cloud App Integration

See [docs/bitbucket-cloud-app.md](./docs/bitbucket-cloud-app.md) for setup, usage, and troubleshooting instructions.
- **Workspace Scope**: Access is limited to workspaces where the app is authorized

## Troubleshooting

### Common Issues

1. **"BITBUCKET_APP_CLIENT_ID environment variable is required"**
  - Ensure `BITBUCKET_APP_CLIENT_ID` is set to your OAuth app's client ID

2. **"BITBUCKET_APP_CLIENT_SECRET environment variable is required"**
  - Ensure `BITBUCKET_APP_CLIENT_SECRET` is set to your OAuth app's client secret

3. **"Failed to authenticate with Bitbucket Cloud App"**
  - Verify the app credentials are correct
  - Check that the app has the required permissions

4. **"No workspaces found"**
  - Verify the app is authorized for the target workspaces
  - Check that the app has access to the repositories you want to import

5. **"Missing integrationId in import targets"**
  - Ensure you have set up the Bitbucket Cloud App integration in each Snyk organization
  - The integration must be configured through the Snyk UI before running `import:data`
  - Check that the integration appears in the organization's integrations list

### Debug Mode

Run with debug logging to get more detailed error information:

```bash
DEBUG=snyk* snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=your-group-id
```
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
