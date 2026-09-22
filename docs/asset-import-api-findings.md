# asset-import — Phase 0 API findings

Empirical verification against the live Snyk Group **"Snyk Professional Services
Engineering > Asset Import Test Environment"** (`SNYK_GROUP_ID` env var), using
`snyk-api-cli curl` (already authenticated in this environment) on
2026-09-22. No SCM was called at any point; every request below is a Snyk API call.

One write action was performed with explicit sign-off (see Q2): a bulk import of
`snyk-labs/snyk-filter` into the test group's only Org, done specifically to produce
an "imported" comparison payload. A second write (tagging that asset) was attempted
and blocked by a tool permission guardrail — see **Blocked** at the end.

---

## Q1 — The search request

`POST /rest/groups/{group_id}/assets/search`, pinned via `?version=2026-03-25`.

An empty body `{}` is accepted and returns a default page, but does **not**
filter server-side — it happened to return only `type: "repository"` assets
because this group currently has no other asset types, not because of any
filtering.

Real server-side filtering requires a `query.attributes` object. Sending `{}`
for it triggers a schema validation error that hands back the full attribute
enum and operator list (reproduced below) — this is how the schema for Q1/Q4/Q6/Q7
below was obtained, in each case cross-checked against a real, working request.

Working request:
```json
POST /rest/groups/{group_id}/assets/search?version=2026-03-25
Content-Type: application/json

{"query":{"attributes":{"attribute":"type","operator":"equal","values":["repository"]}}}
```
Result: 100/100 items returned (page limit) all `"type":"repository"`, confirmed
across two pages (200+ total repository assets in this group).

Queryable `attribute` enum from the schema error:
```
id, type, removed, name, repository_url, file_path, sources, risk_factors,
repository_freshness, browse_url, image_id, image_digests, image_tags,
image_repositories, image_registries, labels, class, organizations,
created_at, updated_at
```
Plus a separate pattern for tags: `tags.{tagName}`, pattern
`^tags\.[a-zA-Z0-9_-]{1,30}$` — i.e. **tag keys are capped at 30 characters**,
alphanumeric/underscore/hyphen only (see Q7).

Operators: `and, or, equal, not_equal, contains, not_contains, starts_with,
ends_with, in, not_in, greater_than, lower_than, equal_or_greater_than,
equal_or_lower_than`.

Tags appear on a returned asset as a top-level `attributes.tags` map (confirmed
from `asset-tagger`'s write path, see Q6) — but see Q3: no asset in a 100-item
sample carried a `tags` key at all, because none in this group currently have
custom tags.

---

## Q2 — Can you tell imported from unimported?

**No. Not in this environment, and I could not make one appear.**

There were zero imports in this Group when I started (only Org:
`Asset Import Test Environment-default`, no projects). With your sign-off I:

1. Captured the `snyk-filter` asset's full search payload ("before").
2. Bulk-imported it via `POST /v1/org/{orgId}/integrations/{integrationId}/import`
   with `{"target":{"owner":"snyk-labs","name":"snyk-filter","branch":"master"}}`.
   Confirmed complete via the job-status endpoint — a real project now exists
   (`projectId 49a8e7b1-...`, visible via `GET /rest/orgs/{orgId}/projects/{id}`).
3. Re-fetched the same asset's search payload ("after") immediately and again
   after ~2.5 minutes.

**The "before" and "after" payloads are byte-identical** — same `updated_at`,
no new relationship, no `organizations` field populated, nothing. I also tried
querying `attribute: "organizations"` directly (`operator: "in"`, the Org's UUID)
— zero matches, before or after the import.

I separately confirmed the project *does* exist and *is* linked to a `target`
(`GET /rest/orgs/{orgId}/targets/{id}` returns the repo URL + the integration),
so the import is real — the Assets API search index in this Group simply isn't
reflecting it, at least not within ~3 minutes.

I also explicitly followed the `relationships.projects.links.related` link the
search payload gives for this asset (`/rest/groups/{group_id}/assets/{id}/relationships/projects`)
— both directly and via `snyk-api-cli list-asset-projects` — three separate
times across this session: immediately after import, ~3 minutes later, and
again much later in a subsequent turn (tens of minutes elapsed). **All three
times it returned `"data":[]`.** I also confirmed there's nothing else to
cross-check against — this Org has exactly one project (mine), so there was no
pre-existing "already imported" asset to test the link against instead.

Also tried: `GET /rest/orgs/{orgId}/assets` (what `list-assets-in-org` calls,
which supports `--filter-project-id`/`--filter-target-id` and looked like it
might be the org-scoped view that reflects this) — **404s outright**,
regardless of API version tried (2024-10-15, 2025-09-28, 2026-01-01,
2026-03-25). That endpoint doesn't appear to be deployed, despite the CLI
shipping a command for it.

**This changes the Phase 3 design as flagged in the original spec: build Phase 3
assuming no reliable "already imported" signal exists on the asset payload**,
until Snyk confirms one of:
- the field/relationship exists but is index-lagged by well over the ~tens of
  minutes I waited (possible — this may be a low-traffic test Group), or
- it exists but needs an explicit `fields`/`include` request param not yet tried, or
- it genuinely isn't populated for repository assets yet.

Recommend asking the Assets API team directly rather than waiting longer —
three follow-throughs on the documented relationship link, spread over an
increasing time gap, all coming back empty is a reasonably strong signal this
isn't just indexing lag.

---

## Q3 — What's on the payload?

**Correction to an earlier version of this doc:** the first pass only pulled
the first page(s) of unfiltered results, which happened to be 100 GitHub repos
in a row, and I wrongly concluded `sources` was always `"github"`. It isn't —
an explicit filter finds real GitLab repos in this same group:

```json
{"query":{"attributes":{"attribute":"sources","operator":"equal","values":["gitlab"]}}}
```
→ 3 hits: `snyk-asset-test-group/snyk-asset-test-project`,
`snyk-asset-test-group/node-goof`, `snyk-asset-test-group/test-proj`, each
with `"sources":["gitlab"]` and a `gitlab.com` `repository_url`. So `sources`
**does** correctly distinguish provider families (github vs gitlab) — my
earlier claim that it never varies was wrong, just under-sampled. What still
holds from the original testing: `sources` distinguishes github vs gitlab, but
not github vs github-enterprise (see Q4 — that distinction genuinely isn't
present anywhere in the payload).

Surveyed 100 repository assets (one full page). Attribute key union across
all 100:
```
archived, browse_url, class, coverage_control, created_at,
default_branch_name, developers, issues_counts, labels, languages, name,
repository_freshness, repository_url, sources, updated_at
```

| Field the import needs | Present? |
|---|---|
| Default branch | `default_branch_name` — **present on 100/100** sampled |
| Repository URL | `repository_url` (and `browse_url`, identical value) — **present on 100/100** |
| SCM organisation | **Not a separate field.** Must be parsed out of `repository_url`/`name` (e.g. `github.com/{owner}/{repo}` → owner). `name` is just the repo name, no separate owner field. |
| Repository name/identifier | `name` — present on 100/100. Asset `id` is an opaque Snyk-internal hash, not usable as an SCM identifier. |
| Asset source | `sources` — present on 100/100 in the GitHub sample, and correctly reads `["gitlab"]` for the 3 GitLab repos in this group (see correction above). It reliably names the provider *family*, but the one repo I imported via the `github-enterprise` integration still reports `sources: ["github"]` — it does not distinguish github vs github-enterprise (see Q4). |
| Tags | `tags` — **absent from all 100 sampled assets** (attribute key doesn't appear at all when there are no tags; none in this group are tagged yet). |

**Verdict: mostly sufficient, with one real gap.** Branch, URL, and name are
reliably populated. But there is no dedicated "SCM organisation/owner" field —
it has to be derived by parsing `repository_url`. That's parsing, not calling,
so it satisfies the invariant, but it's worth you knowing it's derived rather
than given.

---

## Q4 — Provider and integration resolution

**`sources` reliably names the provider family (confirmed github vs gitlab both
present in this group — see the Q3 correction), but structurally cannot
distinguish integration *edition* within a family, and this isn't a gap that
more testing or a different asset would close.**

Per your correction: assets in this Group are discovered exclusively through a
**group-level** discovery integration, which is a separate system from the
**org-level** import integrations (`github` vs `github-enterprise`, etc.) that
`GET /v1/org/{orgId}/integrations` lists. `sources` reflects the former, never
the latter. That's why `snyk-filter` — imported through this Org's
`github-enterprise` integration (confirmed via the project's
`origin: "github-enterprise"` and the target's
`relationships.integration.attributes.integration_type: "github-enterprise"`)
— still reports `sources: ["github"]`: there is no version of this asset,
here or anywhere else, that would ever say "github-enterprise", because
edition isn't a concept the group-level discovery layer carries at all.

**This means Rule 1 step 1 ("determine the provider from the asset payload")
can only ever narrow to a provider *family*** (github vs gitlab vs bitbucket
vs azure) — never to a specific edition/integration. Step 2 (list the Org's
integrations) and step 3 (exact-match / `--integration-type` disambiguation)
aren't a fallback for when step 1 is ambiguous; they're load-bearing for every
single asset, every time, because step 1 structurally can't produce anything
more specific than family. Worth being explicit about this in the Phase 1
implementation so nobody later "optimizes" by trying to skip the integration
lookup for the common case.

**Practical resolution chain, confirmed working end-to-end:**
1. `GET /v1/org/{orgId}/integrations` → `{"github-enterprise": "<uuid>"}` — a
   simple type→ID map. (Tried the REST path first — no equivalent route exists;
   this v1 endpoint is what works.)
2. Since this test Org only has one integration configured, I could not
   empirically exercise the "two integrations, `--integration-type`
   disambiguates" branch of Rule 1. That part of the rule is unverified —
   flagging rather than assuming it behaves as spec'd.
3. Hostname pattern-matching on `repository_url` (all `github.com` in this
   group) would only ever produce "github", never "github-enterprise" — so
   hostname matching alone is not sufficient here even to pick between
   candidate integration *types*, let alone disambiguate multiple. In practice
   the only reliable signal is: does the destination Org have exactly one
   integration at all (regardless of matching `sources`)? If yes, use it. The
   asset's own `sources`/hostname become a secondary sanity check, not the
   primary signal.

This is a bigger finding than the spec anticipated and probably needs your
input before Phase 1 locks in the resolution algorithm.

---

## Q5 — Pagination and limits

- Cursor-based: `starting_after` / `ending_before` opaque tokens, surfaced via
  `links.next` / `links.prev` / `links.first`. No `next` link when a page is
  the last page.
- `limit` query param: **minimum 10, maximum 100.** (Error text for both the
  under-min and over-max cases oddly reads `"limit cannot be less than: N"` —
  it's clearly a copy-paste bug in Snyk's error message for the over-max case,
  but the effective bound is confirmed: `limit=3` → rejected citing min 10;
  `limit=101`/`150`/`1000` → all rejected citing "100"; `limit=100` → 100 items
  returned successfully.)
- Default (no `limit` passed): 10.
- Confirmed 200+ repository assets in this one Group across 2 pages of 100.
- Rate limits, from response headers on the REST assets endpoint:
  `160/s, 1620/min, 97200/hour` ("high" bucket). The v1 bulk-import endpoint
  has its own, separate bucket: `200/s, 2000/min, 60000/hour`. Both are
  per-token buckets (`X-Ratelimit-*` headers), not shared across REST vs v1.

**Noted, not a concern per your call:** every response header showed
`Snyk-Version-Requested: 2026-03-25` / `Snyk-Version-Served: 2025-09-28~beta` —
the gateway silently serves the nearest earlier version rather than erroring.
Per your instruction, `asset-import` will just pin `2026-03-25` (matching
`asset-tagger`) and not worry about which version actually gets served.

---

## Q6 — What tag key is actually in use?

Settled by reading `snyk-labs/asset-tagger` (cloned locally at
`~/git/asset-tagger`, current `main`), not by guessing:

- **Tag key:** `internal/tag/tag.go:48` —
  `const DefaultDestinationOrgKey = "__snyk_destination_org__"`.
  `__application__` shows up only in `apply_test.go:576` as
  `const formerDefault = "__application__"` — i.e. it's the *old* default,
  explicitly superseded. **Unknown #2 is settled: use `__snyk_destination_org__`.**
- **Exclusion sentinel:** `internal/tag/tag.go:60` —
  `const ExcludeValue = "__exclude__"` — **two underscores each side, not three.
  Unknown #3 is settled.**
- **GitLab project ID tag:** `__gitlab_project_id__`, confirmed present
  throughout `asset-tagger`'s tests — matches the spec.
- **Zero assets in the live test group currently carry any of these tags** —
  `asset-tagger` hasn't been run against this Group yet, or its output wasn't
  applied here. Confirmed via `tags.__snyk_destination_org__ contains "a"` →
  zero results.

---

## Q7 — Field limits

From `asset-tagger/internal/tag/tag.go` (their comment states this was itself
empirically re-verified against a live Group, superseding an older recorded
value of 255):

```go
MaxKeyLength   = 30  // pattern ^[a-zA-Z0-9_-]{1,30}$ (alnum, underscore, hyphen)
MaxValueLength = 40  // pattern ^[a-zA-Z0-9_/:?#@&=+%~-]+$
```

I independently corroborated the **key** limit and charset live, for free, as a
side effect of Q1: the search schema's own validation error names the identical
pattern, `^tags\.[a-zA-Z0-9_-]{1,30}$`, for the `tags.{tagName}` filter
attribute. Two independent sources agree: **30 chars, not 255/256. Unknown #5
is settled — the value limit is 40, and the older 255/256 figures in the spec
are stale.**

I did **not** independently re-verify the 40-char **value** limit against the
live API myself — the write action needed to test it (a tag PATCH) was blocked
by a tool permission guardrail before I could send it (see **Blocked**, below).
I'm relying on `asset-tagger`'s own documented live test for that number rather
than re-deriving it. If you want it independently re-confirmed, that just needs
the write permission granted (see below) and one PATCH with a 41-character
value.

**Normalization** (also read from `asset-tagger/internal/tag/tag.go`, function
`Normalize`): lower-case, trim, collapse each run of disallowed characters to a
single hyphen, trim leading/trailing hyphens, truncate to 40 chars, trim any
trailing hyphen left by truncation. Empty-after-normalization inputs are
rejected rather than tagged with a fabricated value.
**This settles unknown #4: the current, live variant lowercases and uses
hyphens** (not the "reversed to map 1:1" variant, and not underscores).
Organization names built from these tag values should assume they already
arrive lowercased/hyphenated by the time `asset-import` reads them.

---

## Design changes required

**Settled — no decision needed:**
1. Tag key: `__snyk_destination_org__` (constant, not `__application__`).
2. Exclusion sentinel: `__exclude__` (two underscores).
3. Org-name normalization: already lowercased/hyphenated by `asset-tagger`
   before `asset-import` ever sees it — no need to re-normalize, just use the
   tag value as-is (maybe re-validate against the same grammar defensively).
4. Tag value max length: 40 chars, not 255/256.
5. `GET /v1/org/{orgId}/integrations` is the working call for "list
   integrations on an Org" (map of type → ID) — no REST equivalent found.
6. `POST /v1/org/{orgId}/integrations/{integrationId}/import` with
   `{"target":{"owner","name","branch"}}` is a confirmed-working GitHub bulk
   import call (201 + job ID; poll the `Location` URL for `status:"complete"`).
7. `internal/snyk.go:CreateOrg` in this repo already POSTs `/v1/org` with
   `{name, groupId, sourceOrgId}` — reusable for Phase 2, not something to
   rebuild.
8. Pagination: cursor-based `starting_after`, `limit` clamped to [10,100].

**Needs your decision:**
1. **Rule 1's step 1 (provider from the asset payload) can only ever resolve to
   a provider family, never an edition — structurally, not just in this
   sample.** Assets are discovered via a group-level integration, separate
   from the org-level import integrations; `sources` reflects the former and
   has no way to carry `github` vs `github-enterprise`. Practically this means
   Rule 1 step 2 (list the Org's integrations) is always required, not just a
   tie-breaker — "detect provider from asset, then check for a single
   matching integration" degrades in the common case to "detect provider
   family, then check for a single integration of that family" (falling back
   to `--integration-type` when the Org has more than one of the same
   family — e.g. both `github` and `github-enterprise`). I still could not
   empirically exercise that multi-integration disambiguation branch itself
   (this test Org only has one integration total) — a second integration added
   to the test Org would let me verify it end-to-end.
2. ~~No empirical signal for "already imported" exists in this environment~~ —
   **settled by your decision below: `asset-import` will track this itself,
   with its own tag, rather than depend on the Assets API for it.**
3. **SCM organisation/owner isn't a first-class field** — it has to be parsed
   from `repository_url`. Confirmed fine to do (parsing, not calling), just
   flagging so it's a known, intentional piece of string-handling logic rather
   than a surprise later.

**Not a concern (per your call):** API version drift (`2026-03-25` requested,
`2025-09-28~beta` served) — pin `2026-03-25` and move on.

---

## Decided: `__snyk_auto_imported__` — asset-import's own "already handled" marker

Since neither the `organizations` attribute, the `projects` relationship, nor
the org-scoped assets endpoint reliably reflects an import (Q2), `asset-import`
will stop trying to derive that state from the Assets API and instead **write
its own record of it**, the same way `asset-tagger` writes
`__snyk_destination_org__` rather than depending on some external signal.

- **New tag key:** `__snyk_auto_imported__` (22 chars, satisfies
  `ValidKey`/the `tags.{tagName}` grammar — alnum/underscore/hyphen, ≤30).
  This key belongs to `asset-import` alone; `asset-tagger` never reads or
  writes it, and per `internal/run/reconcile.go`'s own doc comment
  ("Tags under any other key are left exactly as they were, whether an
  operator set them, another tool did, or an earlier run used a different
  key"), `asset-tagger` reconciliation is confirmed **not** to touch or clear
  keys it doesn't itself resolve — so this tag is safe from being clobbered by
  a later `asset-tagger` run.
- **Value:** the same normalized org-name value currently held in
  `__snyk_destination_org__` at the moment the import succeeds — not a bare
  `"true"`. Reusing that value (rather than a boolean) buys a second thing for
  free: a **moved-org warning**, replacing the spec's original design (which
  assumed the Assets API would flag a mismatch). On each run:
  - `__snyk_auto_imported__` absent → not yet imported, proceed.
  - `__snyk_auto_imported__` == current `__snyk_destination_org__` → already
    imported into the currently-intended Org, skip.
  - `__snyk_auto_imported__` present but **≠** current `__snyk_destination_org__`
    → the asset was imported before, but its destination tag now names a
    different Org (moved, renamed, or retagged) — this is exactly the "someone
    moved a repo" case the spec says to warn about, not act on. Surface it in
    the report; don't re-import or move projects automatically.
- **Written only after a confirmed-successful import** — poll the bulk-import
  job to `status: "complete"` (and check the per-target `success: true` in
  `logs[].projects[]`, since a bulk job can partially fail) before the PATCH,
  never optimistically before or during the import call.
- **Never written during `--dry-run`** — dry-run reports "would mark as
  imported into `<org>`" and makes no PATCH, consistent with the existing
  "dry-run creates and imports nothing" requirement.
- Uses the exact same write mechanics already confirmed from `asset-tagger`'s
  source (Q6/Q7): `PATCH /rest/groups/{group_id}/assets/{asset_id}?version=2026-03-25`,
  `Content-Type: application/vnd.api+json`, body
  `{"data":{"id":..,"type":"repository","attributes":{"tags":{"add":{"__snyk_auto_imported__":"<org>"}}}}}`.
  **Live-verified against `snyk-filter`** (with your sign-off, after the first
  attempt was blocked by a tool permission guardrail — re-granted this time):
  the PATCH succeeded and its response showed, for the first time all session,
  a populated `attributes.tags` map:
  `"tags":{"__snyk_auto_imported__":"asset-import-test-environment-default"}`.
  Independently re-confirmed readable via
  `{"query":{"attributes":{"attribute":"tags.__snyk_auto_imported__","operator":"equal","values":["asset-import-test-environment-default"]}}}`
  — the exact filter shape Phase 3's skip-check will use. Both the write and
  the read side of this design are now confirmed working end-to-end, not just
  inferred from `asset-tagger`'s source.

---

## Blocked

A PATCH to add a test tag to the imported `snyk-filter` asset
(`PATCH /rest/groups/{group_id}/assets/{asset_id}` with
`attributes.tags.add`, the exact call `asset-tagger` itself makes per
`internal/snyk/assets.go:UpdateAssetTags`) was **denied by this session's
"Modify Shared Resources" tool-permission guardrail** before I could send it.
That blocked:
- Independent live re-verification of the 40-char tag **value** limit (Q7) —
  currently resting on `asset-tagger`'s own documented test rather than a
  fresh one.
- Seeing what a tagged-and-imported asset's search payload actually looks like
  end-to-end (would have been a cleaner version of the Q2 test).

If you want either of those closed out, either grant that permission for this
session or run the one PATCH call yourself and share the response.
