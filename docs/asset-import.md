# Asset Import

`asset-import` replaces the older `orgs:data` → `orgs:create` → `import:data` → `import`
workflow for one specific case: repositories that Snyk's **Asset Inventory** already
knows about, and that [`snyk-labs/asset-tagger`](https://github.com/snyk-labs/asset-tagger)
has tagged with the Snyk Organization they belong to.

It reads those tags back out of Snyk, creates any Organization that doesn't exist
yet, and bulk-imports each tagged repository that isn't imported yet - in one pass,
in memory, with no intermediate JSON files.

**GitHub only.** GitLab, Bitbucket, and Azure DevOps are out of scope for this
command (see [asset-import-api-findings.md](./asset-import-api-findings.md) for why).

## The invariant: this command talks only to Snyk

`asset-import` reads from Snyk and writes to Snyk. It never calls a GitHub, GitLab,
or any other SCM API directly - that's `asset-tagger`'s job, upstream. It needs a
single `SNYK_TOKEN` and nothing else.

## How it decides what to do

1. **Ingest**: search the Group's Asset Inventory for repository assets carrying
   the destination-org tag (`__snyk_destination_org__` by default, see `--tagKey`).
   An asset tagged `__exclude__` is skipped as a deliberate exclusion. An asset
   with no tag at all is skipped and reported separately - that usually means
   nobody got to it yet, not that it should be ignored.
2. **Organizations**: any tag value that doesn't match an existing Organization
   name in the Group gets one created. Re-running creates nothing new for
   Organizations that already exist (idempotent).
3. **Already imported?** The Assets API's own `organizations` relationship
   does eventually reflect this, but only after a lag of hours (tied to the
   new project's first scan completing, not the import itself), and it can't
   be filtered on in bulk - only read per-asset (see the findings doc). So
   `asset-import` tags each asset it successfully imports with
   `__snyk_auto_imported__=<org>` as the primary, lag-free signal. On each
   run, per asset:
   - the tag matches the current destination-org tag → already imported, skip.
   - the tag is present but different → the destination tag changed since the
     import (repo moved, renamed, or retagged) - surfaced as a warning, not
     acted on automatically.
   - the tag is absent, but the Assets API's `organizations` relationship
     already names the destination Org → treated as already imported (no
     second import attempt), and the tag is backfilled so the next run takes
     the fast path. This catches a repo imported by hand, or by a run that
     predates this tag.
   - the tag is absent and `organizations` names a *different* Org (or is
     empty) → not yet imported, proceed.
4. **Integration resolution**: the asset's `sources` field only ever narrows to
   a provider *family* (github vs gitlab, etc.) - it cannot tell `github` from
   `github-enterprise` on the destination Org, because assets are discovered
   through a separate, group-level mechanism from the org-level import
   integrations. So this command always lists the destination Org's configured
   integrations and looks for exactly one GitHub-family match. Zero matches:
   skipped. More than one (e.g. an Org with both `github` and
   `github-enterprise`): skipped unless `--integrationType` disambiguates.
5. **Import**: whatever's left is bulk-imported.

## Options

```shell
  --groupId          Snyk group ID                                       [required]
  --tagKey           Tag key naming the destination Organization
                     (default: __snyk_destination_org__)
  --integrationType  Restrict to / disambiguate a specific integration type,
                     e.g. github-enterprise
  --dryRun           Compute and print the full delta; create and import nothing
  --exclusionGlobs   Comma-separated glob patterns to exclude from each import
  --branch           Override the branch to import (default: each repo's default branch)
```

## Usage

```shell
# Preview what would happen - creates and imports nothing
snyk-api-import asset-import --groupId=<snyk_group_id> --dryRun

# Run it for real
snyk-api-import asset-import --groupId=<snyk_group_id>

# Only handle repositories on a specific integration (an Org has both
# github and github-enterprise configured, for example)
snyk-api-import asset-import --groupId=<snyk_group_id> --integrationType=github-enterprise
```

## Output

A summary is printed: Organizations created, Organizations that already existed,
repositories imported, and repositories skipped - bucketed by reason (no tag,
excluded, already imported, moved, no matching integration, ambiguous
integration, unsupported provider) so a support engineer can read it and
understand what happened without re-running anything.

## See also

- [asset-import-api-findings.md](./asset-import-api-findings.md) - the Phase 0
  empirical verification this command's design is based on, including why
  GitLab/Bitbucket/Azure are out of scope and why the `__snyk_auto_imported__`
  tag exists.
