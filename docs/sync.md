# Sync
## Table of Contents
- [Sync](#sync)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
- [What will change?](#what-will-change)
  - [Branches](#branches)
- [Kick off sync](#kick-off-sync)
  - [1. Set the env vars](#1-set-the-env-vars)
  - [2. Download & run](#2-download--run)
  - [Examples](#examples)
    - [Github.com](#githubcom)
- [Known limitations](#known-limitations)

## Prerequisites
You will need to have setup in advance:
- your [Snyk organizations](docs/orgs.md) should exist and have projects
- your Snyk organizations configured with some connection to SCM (Github/Gitlab/Bitbucket etc) as you will need the provide which integration sync should use to update projects.
- you will need your Snyk API token, with correct scope & [admin access for all Organizations](https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets). This command will perform project changes on users behalf (import, update project branch, deactivate projects). **Github Integration Note**: As Github is both an auth & integration, how the integration is done has an effect on usage:
  - For users importing via [Github Snyk integration](https://docs.snyk.io/integrations/git-repository-scm-integrations/github-integration#setting-up-a-github-integration) use your **personal Snyk API token** (Service Accounts are not supported for Github integration imports via API as this is a personal auth token only accessible to the user)
  - For Github Enterprise Snyk integration with a url & token (for Github.com, Github Enterprise Cloud & Github Enterprise hosted) use a **Snyk API service account token**


Any logs will be generated at `SNYK_LOG_PATH` directory.

# What will change?

## Branches
Updating the project branch in Snyk to match the default branch of the repo in the SCM. The drift can happen for several reasons:
- branch was renamed in Github/Gitlab etc on a repo from e.g. from  `master` > `main`
- a new default branch was chosen from existing branches e.g. both `main` and `develop` exist as branches and default branch switched from `main` to `develop`


# Kick off sync
`sync` command will analyze existing projects & targets (repos) in Snyk organization and determine if any changes are needed.

`--dryRun=true` - run the command first in dry-run mode to see what changes will be made in Snyk before running this again without if everything looks good. In this mode the last call to Snyk APIs to make the changes will be skipped but the logs will pretend as if it succeeded, the log entry will indicate this was generate in `dryRun` mode.

The command will produce detailed logs for projects that were `updated` and those that needed an update but `failed`. If no changes are needed these will not be logged.


## 1. Set the env vars
- `SNYK_TOKEN` - your [Snyk api token](https://app.snyk.io/account)
- `SNYK_LOG_PATH` - the path to folder where all logs should be saved,it is recommended creating a dedicated logs folder per import you have running. (Note: all logs will append)
- `SNYK_API` (optional) defaults to `https://snyk.io/api/v1`
- `GITHUB_TOKEN` - SCM token that has read level or similar permissions to see information about repos like default branch & can list files in a repo

## 2. Download & run

Grab a binary from the [releases page](https://github.com/snyk-tech-services/snyk-api-import/releases) and run with `DEBUG=snyk* snyk-api-import-macos import --file=path/to/imported-targets.json`


## Examples

### Github.com

In dry-run mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github --dryRun=true`

Live mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github`

# Known limitations
- Any organizations using a custom branch feature are currently not supported, `sync` will not continue.
- ANy organizations that previously used the custom feature flag should ideally delete all existing projects & re-import to restore the project names to standard format (do not include a branch in the project name). `sync` will work regardless but may cause confusion as the project name will reference a branch that is not likely to be the actual branch being tested.
