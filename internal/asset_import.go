package internal

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// AssetImportOptions configures a single asset-import run.
type AssetImportOptions struct {
	GroupID         string
	TagKey          string // defaults to DestinationOrgTagKey if empty
	IntegrationType string // optional filter/disambiguator, e.g. "github-enterprise"
	DryRun          bool
	ExclusionGlobs  []string
	BranchOverride  string
}

// Skip reason buckets, used both as map keys in AssetImportReport.Skipped and
// as the reasons logged per asset, so a support engineer can read the report
// and understand what happened without re-running with --debug.
const (
	SkipNoTag                = "no destination-org tag"
	SkipExcluded             = "excluded"
	SkipUnsupportedProvider  = "unsupported provider (out of scope)"
	SkipMalformedURL         = "could not parse owner/repo from repository_url"
	SkipNoBranch             = "no branch available"
	SkipNoIntegration        = "no matching integration on destination org"
	SkipAmbiguousIntegration = "multiple matching integrations; use --integration-type"
	SkipAlreadyImported      = "already imported"
	SkipOrgMoved             = "destination org tag changed since import (moved) - not re-importing automatically"

	// dryRunPendingOrgID/dryRunUnresolvedIntegration are placeholders used only
	// under --dry-run, for a candidate whose destination Org doesn't exist yet:
	// there's nothing real to create a Snyk Org record for or list integrations
	// on, so these stand in rather than silently dropping the candidate from
	// the preview. Never reaches ParallelImport - dry-run returns before that.
	dryRunPendingOrgID          = "<pending-org-creation>"
	dryRunUnresolvedIntegration = "<unresolved: org not created yet>"
)

// AssetImportReport summarizes one run: what would happen (--dry-run) or what
// happened (a real run). Skipped is bucketed by reason so a support engineer
// can read it directly.
type AssetImportReport struct {
	DryRun       bool
	OrgsCreated  []string
	OrgsExisting []string
	Imported     []string // "owner/repo -> org" entries
	Skipped      map[string][]string
	ImportErrors []string
}

func newAssetImportReport(dryRun bool) *AssetImportReport {
	return &AssetImportReport{
		DryRun:  dryRun,
		Skipped: map[string][]string{},
	}
}

func (r *AssetImportReport) skip(reason, detail string) {
	r.Skipped[reason] = append(r.Skipped[reason], detail)
}

// candidateAsset is a repository asset that has passed ingestion filtering
// (Phase 1) and carries the destination org name it resolved to.
type candidateAsset struct {
	asset  RepositoryAsset
	orgTag string // lower-cased DestinationOrgTagKey value
	owner  string
	repo   string
}

// RunAssetImport executes the asset-import pipeline end to end: ingest and
// filter tagged repository assets, diff/create destination Organizations,
// resolve each asset's integration, bulk-import what isn't already imported,
// and mark newly-imported assets so a re-run skips them.
//
// GitHub only, by design (see package docs / Phase 0 findings): any asset
// whose provider isn't recognized as GitHub is skipped, not attempted.
func RunAssetImport(ctx context.Context, opts AssetImportOptions) (*AssetImportReport, error) {
	if opts.GroupID == "" {
		return nil, fmt.Errorf("groupID is required")
	}
	tagKey := opts.TagKey
	if tagKey == "" {
		tagKey = DestinationOrgTagKey
	}
	if !ValidTagKey(tagKey) {
		return nil, fmt.Errorf("invalid --tag-key %q: must be 1-%d chars, alphanumeric/underscore/hyphen", tagKey, MaxTagKeyLength)
	}

	report := newAssetImportReport(opts.DryRun)

	assets, err := SearchRepositoryAssets(ctx, opts.GroupID)
	if err != nil {
		return nil, fmt.Errorf("search assets: %w", err)
	}

	// Phase 1: ingest and filter.
	candidates := make([]candidateAsset, 0, len(assets))
	for _, a := range assets {
		rawTag, present := a.Tags[tagKey]
		if !present || strings.TrimSpace(rawTag) == "" {
			report.skip(SkipNoTag, assetLabel(a))
			continue
		}
		tagValue := strings.ToLower(strings.TrimSpace(rawTag))
		if tagValue == ExcludeTagValue {
			report.skip(SkipExcluded, assetLabel(a))
			continue
		}

		if !isGitHubProvider(a) {
			report.skip(SkipUnsupportedProvider, assetLabel(a))
			continue
		}
		owner, repo, ok := ParseGitHubOwnerRepo(a.RepositoryURL)
		if !ok {
			report.skip(SkipMalformedURL, assetLabel(a))
			continue
		}

		candidates = append(candidates, candidateAsset{asset: a, orgTag: tagValue, owner: owner, repo: repo})
	}

	if len(candidates) == 0 {
		return report, nil
	}

	// Phase 2: diff destination Orgs against what exists, create what's missing.
	existingOrgs, err := FetchSnykOrgs(ctx, opts.GroupID)
	if err != nil {
		return nil, fmt.Errorf("fetch existing orgs: %w", err)
	}
	orgIDByName := map[string]string{}
	for _, o := range existingOrgs {
		orgIDByName[strings.ToLower(o.Name)] = o.ID
	}

	wantedOrgNames := map[string]struct{}{}
	for _, c := range candidates {
		wantedOrgNames[c.orgTag] = struct{}{}
	}
	for name := range wantedOrgNames {
		if _, exists := orgIDByName[name]; exists {
			report.OrgsExisting = append(report.OrgsExisting, name)
			continue
		}
		if opts.DryRun {
			report.OrgsCreated = append(report.OrgsCreated, name+" (dry-run: would create)")
			// Phase 3 still needs a placeholder so candidates destined for a
			// not-yet-real org are reported as "would import" rather than
			// silently dropped for lacking an orgID.
			orgIDByName[name] = dryRunPendingOrgID
			continue
		}
		created, err := CreateOrg(ctx, opts.GroupID, name, "")
		if err != nil {
			report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("create org %q: %v", name, err))
			continue
		}
		id, _ := created["id"].(string)
		if id == "" {
			report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("create org %q: response had no id", name))
			continue
		}
		orgIDByName[name] = id
		report.OrgsCreated = append(report.OrgsCreated, name)
	}

	// Phase 3: filter already-imported, resolve integration, import the rest.
	integrationsByOrg := map[string]map[string]string{}
	type importJob struct {
		orgID         string
		integrationID string
		target        ImportTarget
		assetID       string
		orgTag        string
		displayName   string
	}
	var jobs []importJob

	for _, c := range candidates {
		orgID, hasOrgID := orgIDByName[c.orgTag]
		if !hasOrgID {
			// Org creation failed above; already recorded in ImportErrors.
			continue
		}

		if existing, ok := c.asset.Tags[AutoImportedTagKey]; ok {
			existingLower := strings.ToLower(strings.TrimSpace(existing))
			if existingLower == c.orgTag {
				report.skip(SkipAlreadyImported, assetLabel(c.asset))
				continue
			}
			report.skip(SkipOrgMoved, fmt.Sprintf("%s (was imported into %q, tag now says %q)", assetLabel(c.asset), existingLower, c.orgTag))
			continue
		}

		// No tag of our own yet - fall back to the Assets API's own
		// `organizations` relationship. It does populate, just with a
		// multi-hour lag tied to the project's first scan completing (not
		// the import itself), and it's per-asset only, never filterable in
		// bulk - see RepositoryAsset's doc comment. This catches a repo
		// imported by some other means before ever being tagged, and
		// self-heals by backfilling our tag so future runs take the fast,
		// lag-free path instead of re-checking this every time.
		if len(c.asset.Organizations) > 0 {
			matched := false
			for _, o := range c.asset.Organizations {
				if strings.EqualFold(o.Name, c.orgTag) {
					matched = true
					break
				}
			}
			if matched {
				report.skip(SkipAlreadyImported, assetLabel(c.asset)+" (found via organizations relationship, not yet tagged - backfilling)")
				if !opts.DryRun {
					if tagErr := UpdateAssetTags(ctx, opts.GroupID, c.asset.ID, map[string]string{AutoImportedTagKey: c.orgTag}); tagErr != nil {
						report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("backfill tag for %s: %v", assetLabel(c.asset), tagErr))
					}
				}
				continue
			}
			names := make([]string, 0, len(c.asset.Organizations))
			for _, o := range c.asset.Organizations {
				names = append(names, o.Name)
			}
			report.skip(SkipOrgMoved, fmt.Sprintf("%s (already in %v per Assets API, tag now says %q)", assetLabel(c.asset), names, c.orgTag))
			continue
		}

		var integrationID string
		if orgID == dryRunPendingOrgID {
			// The destination org doesn't exist yet (dry-run only), so there
			// is nothing real to look up integrations on. Report the would-be
			// import without a resolved integration rather than skipping it.
			integrationID = dryRunUnresolvedIntegration
		} else {
			integrations, ok := integrationsByOrg[orgID]
			if !ok {
				var err error
				integrations, err = ListIntegrations(ctx, orgID)
				if err != nil {
					report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("list integrations for org %q: %v", c.orgTag, err))
					continue
				}
				integrationsByOrg[orgID] = integrations
			}

			resolved, resolveErr := resolveGitHubIntegration(integrations, opts.IntegrationType)
			if resolveErr != nil {
				report.skip(resolveErr.Error(), assetLabel(c.asset))
				continue
			}
			integrationID = resolved
		}

		branch := opts.BranchOverride
		if branch == "" {
			branch = c.asset.DefaultBranchName
		}
		if branch == "" {
			report.skip(SkipNoBranch, assetLabel(c.asset))
			continue
		}

		target := ImportTarget{
			Target: Target{
				Name:   c.repo,
				Owner:  c.owner,
				Branch: branch,
			},
			OrgID:         orgID,
			IntegrationID: integrationID,
		}
		if len(opts.ExclusionGlobs) > 0 {
			merged := MergeExclusionGlobs(opts.ExclusionGlobs, nil)
			target.ExclusionGlobs = &merged
		}

		jobs = append(jobs, importJob{
			orgID:         orgID,
			integrationID: integrationID,
			target:        target,
			assetID:       c.asset.ID,
			orgTag:        c.orgTag,
			displayName:   c.owner + "/" + c.repo,
		})
	}

	if len(jobs) == 0 {
		return report, nil
	}

	if opts.DryRun {
		for _, j := range jobs {
			report.Imported = append(report.Imported, fmt.Sprintf("%s -> %s (dry-run: would import)", j.displayName, j.orgTag))
		}
		return report, nil
	}

	// Group jobs by (org, integration) since ParallelImport takes one
	// OrgID/IntegrationID pair per invocation.
	type batchKey struct{ orgID, integrationID string }
	batches := map[batchKey][]importJob{}
	var batchOrder []batchKey
	for _, j := range jobs {
		k := batchKey{j.orgID, j.integrationID}
		if _, seen := batches[k]; !seen {
			batchOrder = append(batchOrder, k)
		}
		batches[k] = append(batches[k], j)
	}

	token, err := snykAPIToken()
	if err != nil {
		return nil, err
	}

	for _, k := range batchOrder {
		batchJobs := batches[k]
		targets := make([]ImportTarget, 0, len(batchJobs))
		byDisplayName := map[string]importJob{}
		for _, j := range batchJobs {
			targets = append(targets, j.target)
			byDisplayName[j.displayName] = j
		}

		config := ParallelImportConfig{
			OrgID:         k.orgID,
			IntegrationID: k.integrationID,
			Source:        "github",
			Concurrency:   GetImportConcurrency(0),
			SnykToken:     token,
			PollTimeout:   GetPollTimeout(),
		}
		results, err := ParallelImport(ctx, targets, config)
		if err != nil {
			report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("import batch (org %s): %v", k.orgID, err))
			continue
		}

		for _, name := range results.Imported {
			j, ok := byDisplayName[name]
			if !ok {
				continue
			}
			if tagErr := UpdateAssetTags(ctx, opts.GroupID, j.assetID, map[string]string{AutoImportedTagKey: j.orgTag}); tagErr != nil {
				report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("imported %s but failed to mark it: %v", name, tagErr))
			}
			report.Imported = append(report.Imported, fmt.Sprintf("%s -> %s", name, j.orgTag))
		}
		for _, name := range results.Failed {
			report.ImportErrors = append(report.ImportErrors, fmt.Sprintf("import failed: %s", name))
		}
	}

	return report, nil
}

// isGitHubProvider reports whether an asset belongs to the GitHub family.
// Phase 0 found `sources` reliably distinguishes provider families (github
// vs gitlab both confirmed present in the test group) but never carries
// integration edition (github vs github-enterprise) - that distinction is
// structurally absent at the asset-discovery layer, so it is deliberately
// not attempted here. Falls back to hostname parsing if sources is empty.
func isGitHubProvider(a RepositoryAsset) bool {
	for _, s := range a.Sources {
		if strings.EqualFold(s, "github") {
			return true
		}
	}
	if len(a.Sources) == 0 {
		_, _, ok := ParseGitHubOwnerRepo(a.RepositoryURL)
		return ok
	}
	return false
}

// resolveGitHubIntegration implements Rule 1's resolution chain for the
// GitHub family: narrow the Org's configured integrations to GitHub-family
// types, then require an --integration-type match, a unique match, or fail
// with a reason naming which case applied.
func resolveGitHubIntegration(integrations map[string]string, integrationType string) (string, error) {
	if integrationType != "" {
		id, ok := integrations[integrationType]
		if !ok {
			return "", fmt.Errorf("%s (%q not configured on this org)", SkipNoIntegration, integrationType)
		}
		return id, nil
	}

	candidates := map[string]string{}
	for typ, id := range integrations {
		if strings.Contains(typ, "github") {
			candidates[typ] = id
		}
	}
	switch len(candidates) {
	case 0:
		return "", errors.New(SkipNoIntegration)
	case 1:
		for _, id := range candidates {
			return id, nil
		}
	}
	return "", errors.New(SkipAmbiguousIntegration)
}

func assetLabel(a RepositoryAsset) string {
	if a.RepositoryURL != "" {
		return a.RepositoryURL
	}
	if a.Name != "" {
		return a.Name
	}
	return a.ID
}
