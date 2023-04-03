# Sync

## Table of Contents

- [Sync](#sync)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
- [What will change?](#what-will-change)
  - [Branches](#branches)
  - [De-activating Snyk projects that represent files that have been renamed/moved/deleted](#de-activating-snyk-projects-that-represent-files-that-have-been-renamedmoveddeleted)
    - [Scenarios](#scenarios)
      - [File renamed/moves/deleted](#file-renamedmovesdeleted)
      - [node\_modules, tests \& fixtures](#node_modules-tests--fixtures)
  - [Detecting \& importing new files not already monitored in Snyk](#detecting--importing-new-files-not-already-monitored-in-snyk)
  - [Repository is archived](#repository-is-archived)
- [Kick off sync](#kick-off-sync)
  - [1. Set the env vars](#1-set-the-env-vars)
  - [2. Download \& run](#2-download--run)
  - [3. Review logs](#3-review-logs)
    - [--dryRun](#--dryrun)
  - [Examples](#examples)
    - [Github.com](#githubcom)
    - [GitHub Enterprise Server](#github-enterprise-server)
    - [GitHub Enterprise Cloud](#github-enterprise-cloud)
    - [Only syncing Container projects (Dockerfiles)](#only-syncing-container-projects-dockerfiles)
    - [Only syncing Open Source + Iac projects (Dockerfiles)](#only-syncing-open-source--iac-projects-dockerfiles)
    - [Exclude from syncing certain files \& directories](#exclude-from-syncing-certain-files--directories)
- [Known limitations](#known-limitations)

## Prerequisites

You will need to have setup in advance:

- your [Snyk organizations](docs/orgs.md) should exist and have projects
- your Snyk organizations configured with some connection to SCM (Github or Github Enterprise, only) as you will need the provide which integration sync should use to update projects.
- you will need your Snyk API token, with correct scope & [admin access for all Organizations](https://snyk.docs.apiary.io/#reference/import-projects/import/import-targets). This command will perform project changes on users behalf (import, update project branch, deactivate projects). **Github Integration Note**: As Github is both an auth & integration, how the integration is done has an effect on usage:
  - For users importing via [Github Snyk integration](https://docs.snyk.io/integrations/git-repository-scm-integrations/github-integration#setting-up-a-github-integration) use your **personal Snyk API token** (Service Accounts are not supported for Github integration imports via API as this is a personal auth token only accessible to the user)
  - For Github Enterprise Snyk integration with a url & token (for Github.com, Github Enterprise Cloud & Github Enterprise hosted) use a **Snyk API service account token**

Any logs will be generated at `SNYK_LOG_PATH` directory.

# What will change?

## Branches

Updating the project branch in Snyk to match the default branch of the repo in the SCM. The drift can happen for several reasons:

- branch was renamed in Github/Gitlab etc on a repo from e.g. from `master` > `main`
- a new default branch was chosen from existing branches e.g. both `main` and `develop` exist as branches and default branch switched from `main` to `develop`

## De-activating Snyk projects that represent files that have been renamed/moved/deleted

During sync a shallow clone of a repo will be done to find all files in the repo and compare them to files monitored by Snyk. If any file is no longer found in the repo, the corresponding Snyk project will be deactivated.

### Scenarios

#### File renamed/moves/deleted

If a file in a repo moved, was re-named, repo was re-named. These will be broken projects in Snyk and therefore deactivated by `sync` command e.g. `src/package.json` > `src/lib/package.json`

#### node_modules, tests & fixtures

Any projects that were imported but match the default exclusions list (deemed to be fixtures or tests) will also be deactivated. The list matches the same pattern used in Snyk during import via UI. The full list is:

- `fixtures`
- `tests`
- `__tests__`
- `test`
- `__test__`
- `ci`
- `node_modules`
- `bower_components`
- `.git`

## Detecting & importing new files not already monitored in Snyk

While analyzing each target known to Snyk any new Snyk supported files found in the repo that do not have a corresponding project in Snyk will be imported in batches. Any files matching the default or user provided `exclusionGlobs` will be ignored.
If a file has a corresponding de-activated project in Snyk, it will not be brought in again. Activate manually or via API if it should be active.

## Repository is archived

If the repository is now marked as archived, all relevant Snyk projects will be de-activated.
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

## 3. Review logs

The `sync` command will generate several logs:

- `<snyk_public_org_id>.failed-to-sync-target.log` will contain error information when an entire target (Github repo) could not be processed, this can be because the provided token does not have access to this repo, it is archived or deleted etc.
- `<snyk_public_org_id>.updated-projects.log` will contain project specific information on what kind of update was performed on the project:
  - `branch` Snyk project default branch was updated
  - `deactivate` Snyk project was deactivated
  - `import` Snyk project was created from detected supported file

When `import` is triggered additional import logs will be generated. See [Kicking off an import](../docs/import.md#4-review-logs) documentation for more detailed information on generated logs.

### --dryRun

When running `sync` in `--dryRun` mode the logs will have `dryRun` as `true` so these can be separated from live updates.

## Examples

### Github.com

In dry-run mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github --exclusionGlobs=**/package.json,logs --dryRun=true`

Live mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github`

### GitHub Enterprise Server

In dry-run mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise --sourceUrl=https://custom.ghe.com --dryRun=true`

Live mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise --sourceUrl=https://custom.ghe.com --exclusionGlobs=**/*.yaml,logs`

### GitHub Enterprise Cloud

In dry-run mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise --dryRun=true`

Live mode:
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise`

### Only syncing Container projects (Dockerfiles)

`--snykProduct` can be used to specify to sync projects belonging to Open Source, Container (Dockerfiles) or IaC products which represent files in Git repos.
`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise --snykProduct=container`

### Only syncing Open Source + Iac projects (Dockerfiles)

`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise --snykProduct=open-source --snykProduct=iac`

### Exclude from syncing certain files & directories

`DEBUG=*snyk* SNYK_TOKEN=xxxx snyk-api-import sync --orgPublicId=<snyk_org_public_id> --source=github-enterprise --snykProduct=open-source --snykProduct=iac --exclusionGlobs=**/*.yaml,logs,system-test`

# Known limitations

- Any organizations using a custom branch feature are currently not supported, `sync` will not continue.
- Any organizations that previously used the custom feature flag should ideally delete all existing projects & re-import to restore the project names to standard format (do not include a branch in the project name). `sync` will work regardless but may cause confusion as the project name will reference a branch that is not likely to be the actual branch being tested.
- It is not possible to know if a file was moved or renamed in the current implementation as it requires looking through commits history or using webhooks. It is also not currently possible to re-name projects in Snyk. In all cases projects will be deactivated and their replacement re-imported, creating a new projects with new history.
- Deleted repos are not yet supported.
