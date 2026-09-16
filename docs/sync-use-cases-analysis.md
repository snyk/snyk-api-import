# Sync Command Use Cases Analysis

This document analyzes the current capabilities of the `sync` command and what would be required to implement unsupported use cases.

## Current Capabilities

### What Sync Currently Supports

| Capability | Status | Description |
|------------|--------|-------------|
| Detect new repo in group | ✅ Supported | `CompareStates` identifies repos in source but not in Snyk |
| Import new repo into Snyk | ✅ Supported | Missing repos are imported via the integration |
| Import all repos not in Snyk | ✅ Supported | Core functionality of sync |
| Detect deleted repo | ✅ Supported | Identified as `Stale` → deactivated |
| Detect new manifest file | ✅ Supported | Manifest discovery finds new files → imports |
| Detect deleted manifest file | ✅ Supported | Old manifest marked `Stale` → deactivated |
| Detect default branch change | ✅ Supported | `BranchUpdates` + PATCH API |
| Detect default branch rename | ✅ Supported | Same as branch change (e.g., master→main) |
| Product-specific filtering | ✅ Supported | `--snykProduct` flag: `openSource`, `container`, `iac` |
| Dry-run mode | ✅ Supported | `--dryRun` flag previews actions |
| Exclusion patterns | ✅ Supported | `--exclusionGlobs` flag |
| Detect archived repo | ⚠️ Partial | Skips archived repos silently; no deactivation or reporting |
| Detect unsupported repo | ⚠️ Partial | `ImportableEmpty` tracks repos with no manifests; no detailed categorization |

### Supported Source Control Platforms

| Platform | Status |
|----------|--------|
| GitHub | ✅ |
| GitHub Enterprise | ✅ |
| GitHub Cloud App | ✅ |
| GitLab | ✅ |
| Azure Repos | ✅ |
| Bitbucket Cloud | ✅ |
| Bitbucket Cloud App | ✅ |
| Bitbucket Server | ✅ |

### Core Data Structures

```go
// CompareResult is the result of comparing source control and Snyk states.
type CompareResult struct {
    Missing         []map[string]interface{} // Repos in source control but not in Snyk
    Stale           []map[string]interface{} // Projects in Snyk but not in source control
    ImportableEmpty []map[string]interface{} // Missing repos with no manifest files
    BranchUpdates   []BranchUpdate           // Projects where the default branch changed
}

// BranchUpdate represents a project where the default branch changed
type BranchUpdate struct {
    OldSnykProject map[string]interface{}
    NewSourceRepo  map[string]interface{}
    OldBranch      string
    NewBranch      string
}
```

---

## Partially Supported Use Cases - Full Implementation

These features have partial support but need additional work to be fully functional.

### P1. Detect Archived Repo (Partial → Full)

**Current State:** GitHub, GitLab, and Azure already detect archived/disabled repos but **skip them silently**. They are not reported or tracked.

**Current Code Behavior:**

| SCM | Field | Behavior |
|-----|-------|----------|
| GitHub | `repo.GetArchived()` | Skipped with debug log |
| GitLab | `project.Archived` | Skipped with debug log |
| Azure | `repo.IsDisabled` | Skipped with debug log |
| Bitbucket Cloud | None | No archive detection |
| Bitbucket Server | None | No archive detection |

**Current Code (github.go:138-142):**
```go
// Skip archived repositories
if repo.GetArchived() {
    Logger.Debugf("Skipping archived repo: %s/%s", orgName, *repo.Name)
    continue
}
```

**What's Missing:**
1. Archived repos should be **included** in results with a flag
2. Snyk projects for archived repos should be **deactivated**
3. Archived status should be **reported separately** from deleted
4. Bitbucket Cloud/Server need archive detection added

**Proposed Changes:**

```go
// Extend CompareResult in sync_types.go
type CompareResult struct {
    Missing         []map[string]interface{}
    Stale           []map[string]interface{}
    ImportableEmpty []map[string]interface{}
    BranchUpdates   []BranchUpdate
    Archived        []ArchivedRepo  // NEW: Repos that were archived
}

type ArchivedRepo struct {
    Owner          string
    Name           string
    Branch         string
    SnykProjectIDs []string // Projects to deactivate
    ArchivedAt     time.Time // If available from API
}
```

**Implementation Steps:**

1. **Modify SCM fetch functions** to include archived repos:

```go
// github.go - change from skip to include with flag
if repo.GetArchived() {
    allRepos = append(allRepos, map[string]string{
        "name":     *repo.Name,
        "owner":    owner,
        "branch":   branch,
        "archived": "true",  // NEW: mark as archived
    })
    continue // Don't discover manifests for archived repos
}
```

2. **Add archive detection to Bitbucket:**

For Bitbucket Cloud, check the `is_private` vs read-only status or use the `updated_on` field for staleness detection.

For Bitbucket Server, the API provides `archived` field in repository response.

3. **Modify CompareStates** to detect archived repos:

```go
// sync_compare.go
func CompareStates(snykProjects, sourceRepos []map[string]interface{}, manifestTypes []string) CompareResult {
    var archived []ArchivedRepo
    
    for _, r := range sourceRepos {
        if isArchived, _ := r["archived"].(string); isArchived == "true" {
            // Find matching Snyk projects and add to archived list
            owner, _ := r["owner"].(string)
            name, _ := r["name"].(string)
            
            var projectIDs []string
            for _, p := range snykProjects {
                if matchesRepo(p, owner, name) {
                    if id, ok := p["id"].(string); ok {
                        projectIDs = append(projectIDs, id)
                    }
                }
            }
            
            if len(projectIDs) > 0 {
                archived = append(archived, ArchivedRepo{
                    Owner:          owner,
                    Name:           name,
                    SnykProjectIDs: projectIDs,
                })
            }
            continue // Don't process further
        }
        // ... existing logic
    }
    
    return CompareResult{
        // ... existing fields
        Archived: archived,
    }
}
```

4. **Add deactivation logic** for archived repos:

```go
// In sync execution (e.g., sync_github.go)
if len(result.Archived) > 0 {
    Logger.Infof("Deactivating %d projects for archived repos", len(result.Archived))
    for _, ar := range result.Archived {
        Logger.Infof("  Archived repo: %s/%s (%d projects)", ar.Owner, ar.Name, len(ar.SnykProjectIDs))
        if !dryRun {
            _, err := BulkDeactivateProjects(ctx, orgID, ar.SnykProjectIDs, false)
            if err != nil {
                Logger.Errorf("Failed to deactivate projects for archived repo %s/%s: %v", ar.Owner, ar.Name, err)
            }
        }
    }
}
```

5. **Add CLI flag** for archive behavior:

```go
// cmd/sync.go
archiveAction := fs.String("archiveAction", "deactivate", "Action for archived repos: deactivate, ignore, warn")
```

**Files to Modify:**
- `internal/sync_types.go` - Add `Archived` field and `ArchivedRepo` type
- `internal/github.go` - Include archived repos with flag
- `internal/githubapp.go` - Include archived repos with flag
- `internal/gitlab.go` - Include archived repos with flag
- `internal/azure.go` - Include disabled repos with flag
- `internal/bitbucketcloud.go` - Add archive detection (if API supports)
- `internal/bitbucketserver.go` - Add archive detection
- `internal/sync_compare.go` - Detect archived repos separately
- `internal/sync_*.go` - Handle archived repos in each sync implementation
- `cmd/sync.go` - Add `--archiveAction` flag

**Estimated Effort:** 1-1.5 sprints

---

### P2. Detect Unsupported Repo (Partial → Full)

**Current State:** `ImportableEmpty` tracks repos with no manifest files, but:
- It only covers "no manifests found" - not "manifests exist but unsupported"
- No distinction between "truly empty" vs "unsupported language/ecosystem"
- No reporting to Snyk that the repo is "covered with no risk"

**Current Code (sync_types.go):**
```go
type CompareResult struct {
    // ...
    ImportableEmpty []map[string]interface{} // Missing repos with no manifest files
}
```

**What's Missing:**
1. Distinguish between "empty repo" and "repo with unsupported files"
2. Track repos where Snyk scanned but found no supported manifests
3. Optionally create a "placeholder" project in Snyk to show repo is covered
4. Report on why a repo is unsupported (no files vs unsupported language)

**Proposed Changes:**

```go
// Extend sync_types.go
type UnsupportedRepo struct {
    Owner           string
    Name            string
    Branch          string
    Reason          UnsupportedReason
    DetectedFiles   []string // Files found but not supported
    SuggestedAction string   // e.g., "Add package.json for npm support"
}

type UnsupportedReason string

const (
    ReasonEmptyRepo       UnsupportedReason = "empty"           // No files at all
    ReasonNoManifests     UnsupportedReason = "no_manifests"    // Has files but no manifests
    ReasonUnsupportedLang UnsupportedReason = "unsupported"     // Has manifests but unsupported type
    ReasonExcluded        UnsupportedReason = "excluded"        // Matches exclusion glob
)

// Extend CompareResult
type CompareResult struct {
    Missing         []map[string]interface{}
    Stale           []map[string]interface{}
    ImportableEmpty []map[string]interface{} // Keep for backward compat
    BranchUpdates   []BranchUpdate
    Archived        []ArchivedRepo
    Unsupported     []UnsupportedRepo  // NEW: Detailed unsupported info
}
```

**Implementation Steps:**

1. **Enhance manifest discovery** to categorize repos:

```go
// sync_helpers.go
type RepoScanResult struct {
    Owner         string
    Name          string
    Branch        string
    Manifests     []string          // Supported manifests found
    OtherFiles    []string          // Non-manifest files found
    TotalFiles    int               // Total file count
    Reason        UnsupportedReason // Why unsupported (if applicable)
}

func CategorizeRepo(files []string, manifestTypes []string, exclusionGlobs []string) RepoScanResult {
    result := RepoScanResult{}
    
    for _, file := range files {
        // Check if excluded
        for _, glob := range exclusionGlobs {
            if matched, _ := doublestar.Match(glob, file); matched {
                result.Reason = ReasonExcluded
                continue
            }
        }
        
        // Check if supported manifest
        isManifest := false
        for _, mt := range manifestTypes {
            if matched, _ := doublestar.Match(mt, file); matched {
                result.Manifests = append(result.Manifests, file)
                isManifest = true
                break
            }
        }
        
        if !isManifest {
            result.OtherFiles = append(result.OtherFiles, file)
        }
        result.TotalFiles++
    }
    
    // Determine reason
    if result.TotalFiles == 0 {
        result.Reason = ReasonEmptyRepo
    } else if len(result.Manifests) == 0 {
        // Check if there are any manifest-like files that aren't supported
        if hasUnsupportedManifests(result.OtherFiles) {
            result.Reason = ReasonUnsupportedLang
        } else {
            result.Reason = ReasonNoManifests
        }
    }
    
    return result
}

func hasUnsupportedManifests(files []string) bool {
    unsupportedPatterns := []string{
        "*.cabal",           // Haskell
        "Package.swift",     // Swift (partially supported)
        "WORKSPACE",         // Bazel
        "BUILD.bazel",       // Bazel
        "*.csproj",          // If .NET not enabled
        "Carthage",          // iOS Carthage
    }
    for _, f := range files {
        for _, p := range unsupportedPatterns {
            if matched, _ := doublestar.Match(p, filepath.Base(f)); matched {
                return true
            }
        }
    }
    return false
}
```

2. **Add detailed reporting**:

```go
// In sync execution
if len(result.Unsupported) > 0 {
    Logger.Infof("\n=== Unsupported Repos Summary ===")
    
    byReason := make(map[UnsupportedReason][]UnsupportedRepo)
    for _, u := range result.Unsupported {
        byReason[u.Reason] = append(byReason[u.Reason], u)
    }
    
    for reason, repos := range byReason {
        Logger.Infof("\n%s (%d repos):", reason, len(repos))
        for _, r := range repos {
            Logger.Infof("  - %s/%s", r.Owner, r.Name)
            if len(r.DetectedFiles) > 0 {
                Logger.Debugf("    Files: %v", r.DetectedFiles[:min(5, len(r.DetectedFiles))])
            }
        }
    }
}
```

3. **Optional: Create placeholder projects** in Snyk:

This would require Snyk platform support for "coverage without risk" projects.

```go
// Future enhancement - requires Snyk API support
if cfg.CreatePlaceholders {
    for _, u := range result.Unsupported {
        // Create a placeholder project in Snyk
        // This would mark the repo as "covered" in Snyk UI
        err := CreatePlaceholderProject(ctx, orgID, u.Owner, u.Name, u.Reason)
        if err != nil {
            Logger.Warnf("Failed to create placeholder for %s/%s: %v", u.Owner, u.Name, err)
        }
    }
}
```

4. **Add CLI flags** for unsupported repo handling:

```go
// cmd/sync.go
reportUnsupported := fs.Bool("reportUnsupported", true, "Report details about unsupported repos")
unsupportedFormat := fs.String("unsupportedFormat", "summary", "Format for unsupported repos: summary, detailed, json")
```

5. **Generate unsupported repos report file**:

```go
// Write detailed report to file
if *reportUnsupported {
    reportPath := filepath.Join(snykLogPath, fmt.Sprintf("%s-unsupported-repos.json", source))
    report := UnsupportedReport{
        GeneratedAt: time.Now(),
        OrgID:       orgID,
        Source:      source,
        Repos:       result.Unsupported,
        Summary: map[string]int{
            "empty":       countByReason(result.Unsupported, ReasonEmptyRepo),
            "no_manifests": countByReason(result.Unsupported, ReasonNoManifests),
            "unsupported": countByReason(result.Unsupported, ReasonUnsupportedLang),
            "excluded":    countByReason(result.Unsupported, ReasonExcluded),
        },
    }
    writeJSONReport(reportPath, report)
}
```

**Files to Modify:**
- `internal/sync_types.go` - Add `UnsupportedRepo` type and `UnsupportedReason` enum
- `internal/sync_helpers.go` - Add `CategorizeRepo` function
- `internal/sync_compare.go` - Populate `Unsupported` slice
- `internal/sync_*.go` - Report unsupported repos in each sync implementation
- `cmd/sync.go` - Add reporting flags

**Estimated Effort:** 1-1.5 sprints

---

## Unsupported Use Cases - Implementation Analysis

### 1. Detect Repo Moved to Different Group

**Complexity:** High

**Current State:** Not supported. Sync operates on a single org/group at a time with no cross-org awareness.

**What's Needed:**
- State persistence: Store a mapping of `repo_id → group` from previous runs
- Cross-org comparison: Query multiple orgs/groups
- New data structure to track moves

**Proposed Changes:**

```go
// Add to sync_types.go
type RepoMoved struct {
    RepoID     string
    RepoName   string
    FromGroup  string
    ToGroup    string
    SnykProjectIDs []string // Projects that need updating
}

// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    Moved []RepoMoved
}
```

**Implementation Steps:**
1. Add persistent state file (JSON/SQLite) to track repo→group mappings
2. Modify all `FetchXXXRepos` functions to return repo IDs (most already have them)
3. Add cross-org query capability or accept multiple org IDs as input
4. New comparison logic in `CompareStates` to detect moves by repo ID
5. Handle moved repos (update Snyk project metadata or deactivate + reimport)

**Estimated Effort:** 2-3 sprints

---

### 2. Detect Repo Group Name Change

**Complexity:** Medium-High

**Current State:** Not supported. Groups are identified by name, not ID.

**What's Needed:**
- State persistence: Store `group_id → group_name` from previous runs
- Group ID tracking: Use immutable group IDs rather than names

**Proposed Changes:**

```go
// Add to sync_types.go
type GroupRenamed struct {
    GroupID  string
    OldName  string
    NewName  string
}
```

**Implementation Steps:**
1. Modify `FetchXXXOrgs/Groups` to return both ID and name
2. Persist group mappings between runs
3. Add comparison logic to detect name changes by ID
4. Update Snyk org names if applicable

**Estimated Effort:** 1-2 sprints

---

### 3. Detect Repo Name Change

**Complexity:** Medium

**Current State:** Not supported. `CompareStates` uses `owner/name` as the key, so a renamed repo appears as "stale + new".

**What's Needed:**
- State persistence: Store `repo_id → repo_name` from previous runs
- Use repo IDs for matching (SCM APIs all provide immutable repo IDs)

**Proposed Changes:**

```go
// Add to sync_types.go
type RepoRenamed struct {
    RepoID         string
    OldName        string
    NewName        string
    Owner          string
    SnykProjectIDs []string // Projects to update
}

// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    Renamed []RepoRenamed
}
```

**Implementation Steps:**
1. Add repo ID to the comparison key structure in `CompareStates`
2. Persist previous state (repo ID → name mapping)
3. Detect renamed repos by matching IDs with different names
4. Update Snyk project names via API (if supported) or deactivate + reimport

**Snyk API Consideration:** Verify if Snyk API supports updating project name/target.

**Estimated Effort:** 1-2 sprints

---

### 4. Detect Archived Repo

**Complexity:** Low

**Current State:** Partially supported. GitHub and GitLab already skip archived repos during fetch, but they're not explicitly tracked or reported.

**Current Code (github.go:138-141):**
```go
// Skip archived repositories
if repo.GetArchived() {
    Logger.Debugf("Skipping archived repo: %s/%s", orgName, *repo.Name)
    continue
}
```

**What's Needed:**
- Include archived repos in fetch results with an `archived` flag
- Report "archived" separately from "deleted"
- Deactivate Snyk projects for archived repos

**Proposed Changes:**

```go
// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    Archived []map[string]interface{} // Repos that were archived
}
```

**Implementation Steps:**
1. Modify `FetchXXXRepos` to include archived repos with `archived: true` flag
2. Add `Archived` slice to `CompareResult`
3. Modify `CompareStates` to detect archived repos
4. Deactivate Snyk projects for archived repos (same as stale, but with different logging)

**Estimated Effort:** 0.5-1 sprint

---

### 5. Detect Moved File

**Complexity:** High

**Current State:** Not supported. Snyk projects are tied to file paths. Moving a file creates a new project.

**What's Needed:**
- File-level tracking: Store `file_path → file_hash/id` from previous runs
- Git history analysis: Use git diff/log to detect renames vs delete+create
- Snyk API support for updating `targetFile`

**Proposed Changes:**

```go
// Add to sync_types.go
type FileMoved struct {
    RepoOwner      string
    RepoName       string
    OldPath        string
    NewPath        string
    FileHash       string
    SnykProjectID  string
}

// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    FilesMoved []FileMoved
}
```

**Implementation Steps:**
1. Persist file→hash mappings per repo
2. Use SCM APIs to fetch file SHAs/hashes
3. Detect moves by matching content hashes with different paths
4. Call Snyk API to update project `targetFile` (if supported)
5. Fallback to deactivate + reimport if update not supported

**Snyk API Limitation:** May not support updating `targetFile` on existing projects. Needs verification.

**Estimated Effort:** 3-4 sprints (depends on Snyk API capabilities)

---

### 6. Detect Renamed File

**Complexity:** High (Same as moved file)

**Current State:** Not supported. File rename = file move with same parent directory.

**Implementation:** Same as #5 (Detect Moved File). A renamed file is just a move where only the filename changes.

**Estimated Effort:** Included in #5

---

### 7. Detect New Branch (Non-default)

**Complexity:** Medium-High

**Current State:** Not supported. Sync only tracks the default branch.

**What's Needed:**
- Multi-branch mode architecture
- Branch configuration (user specifies which branches to monitor)
- Per-branch projects (one Snyk project per branch per manifest)

**Proposed Changes:**

```go
// Add to config or CLI flags
type SyncConfig struct {
    TrackBranches []string // e.g., ["main", "develop", "release/*"]
}

// Add to sync_types.go
type NewBranch struct {
    RepoOwner  string
    RepoName   string
    BranchName string
    Manifests  []string
}

// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    NewBranches []NewBranch
}
```

**Implementation Steps:**
1. Add `--branches` flag or config option (e.g., `main,develop,release/*`)
2. Modify `FetchXXXRepos` to return multiple entries per repo (one per tracked branch)
3. Expand comparison key to include branch
4. Handle branch creation events (import new branch projects)
5. Support glob patterns for branch matching (e.g., `release/*`)

**Estimated Effort:** 2-3 sprints

---

### 8. Detect Deleted/Merged Branch

**Complexity:** Medium

**Current State:** Not supported. Only the default branch is monitored.

**What's Needed:**
- State persistence: Track which branches existed previously
- Branch list comparison: Compare current vs previous branch lists

**Proposed Changes:**

```go
// Add to sync_types.go
type DeletedBranch struct {
    RepoOwner      string
    RepoName       string
    BranchName     string
    WasMerged      bool // If we can detect this
    SnykProjectIDs []string
}

// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    DeletedBranches []DeletedBranch
}
```

**Implementation Steps:**
1. Fetch all branches per repo (not just default)
2. Persist branch list per repo between runs
3. Detect removed branches → deactivate associated Snyk projects
4. Optionally detect if branch was merged (check if commits exist in another branch)

**Prerequisite:** Easier to implement if #7 (New Branch detection) is done first.

**Estimated Effort:** 1-2 sprints

---

### 9. Clean Up Ecosystem Version Change

**Complexity:** Very High

**Current State:** Not supported. Migrating from one package manager to another (e.g., `requirements.txt` → `pyproject.toml`) creates a new project.

**What's Needed:**
- Ecosystem version detection: Understand that certain manifest changes are "migrations"
- Semantic understanding: Know which manifest types are replacements for others
- Project linking: Link old project to new without losing history

**Proposed Changes:**

```go
// Add to sync_helpers.go
var ecosystemMigrations = map[string][]string{
    // Python
    "requirements.txt": {"pyproject.toml", "Pipfile", "poetry.lock"},
    "setup.py":         {"pyproject.toml"},
    "Pipfile":          {"pyproject.toml"},
    
    // Go
    "Gopkg.lock": {"go.mod"},
    "vendor.json": {"go.mod"},
    
    // JavaScript (less common, but possible)
    "package-lock.json": {"yarn.lock", "pnpm-lock.yaml"},
    
    // .NET
    "packages.config": {"*.csproj"}, // PackageReference migration
}

// Add to sync_types.go
type EcosystemMigration struct {
    RepoOwner       string
    RepoName        string
    OldManifest     string
    NewManifest     string
    OldProjectID    string
    NewProjectID    string // After import
}

// Extend CompareResult
type CompareResult struct {
    // ... existing fields
    EcosystemMigrations []EcosystemMigration
}
```

**Implementation Steps:**
1. Define ecosystem migration mappings
2. Detect when old manifest disappears and new one appears in same repo
3. Check if they're related ecosystems (e.g., both Python)
4. Deactivate old project, import new (or update if Snyk supports linking)
5. Optionally: Transfer issue ignores/policies from old to new project

**Snyk Platform Consideration:** May require Snyk platform changes to support project "linking" or history transfer.

**Estimated Effort:** 4+ sprints (and may require Snyk platform support)

---

## State Persistence Architecture

Several use cases require state persistence. A shared approach:

```go
// internal/state/state.go
type SyncState struct {
    Version    int                          `json:"version"`
    UpdatedAt  time.Time                    `json:"updated_at"`
    OrgID      string                       `json:"org_id"`
    Repos      map[string]RepoState         `json:"repos"`      // key: repo_id
    Groups     map[string]GroupState        `json:"groups"`     // key: group_id
    Branches   map[string][]string          `json:"branches"`   // key: repo_id, value: branch names
    Files      map[string]map[string]string `json:"files"`      // key: repo_id, subkey: file_path, value: hash
}

type RepoState struct {
    ID       string `json:"id"`
    Name     string `json:"name"`
    Owner    string `json:"owner"`
    GroupID  string `json:"group_id"`
    Archived bool   `json:"archived"`
}

type GroupState struct {
    ID   string `json:"id"`
    Name string `json:"name"`
}

// Functions
func LoadState(path string) (*SyncState, error)
func SaveState(path string, state *SyncState) error
func (s *SyncState) DetectChanges(current *SyncState) *ChangeSet
```

**Storage Location:** `$SNYK_LOG_PATH/.sync-state/<org_id>.json`

---

## Summary & Prioritization

### Partial → Full Implementation

| Use Case | Current State | Complexity | Estimated Effort |
|----------|---------------|------------|------------------|
| Archived repo detection | Skips silently | Low | 1-1.5 sprints |
| Unsupported repo detection | Basic `ImportableEmpty` | Low-Medium | 1-1.5 sprints |

### Not Supported → Full Implementation

| Use Case | Complexity | Key Blocker | Estimated Effort | Priority |
|----------|------------|-------------|------------------|----------|
| Repo name change | Medium | State persistence + Snyk API | 1-2 sprints | 1 (High) |
| Deleted/merged branch | Medium | State persistence | 1-2 sprints | 2 (High) |
| New branch | Medium-High | Multi-branch architecture | 2-3 sprints | 3 (Medium) |
| Repo moved to group | High | State persistence + cross-org | 2-3 sprints | 4 (Medium) |
| Group name change | Medium-High | State persistence | 1-2 sprints | 5 (Low) |
| Moved/renamed file | High | File-level tracking + Snyk API | 3-4 sprints | 6 (Low) |
| Ecosystem migration | Very High | Semantic knowledge + platform | 4+ sprints | 7 (Low) |

### Recommended Implementation Order

**Phase 1: Quick Wins (Partial → Full)**
1. **Archived repo detection** - Low effort, high value, already has detection logic
2. **Unsupported repo detection** - Enhances existing `ImportableEmpty`, better reporting

**Phase 2: State Persistence Foundation**
3. **State persistence infrastructure** - Enables multiple features below
4. **Repo name change** - Medium effort, addresses common pain point

**Phase 3: Branch Lifecycle**
5. **New branch detection** - Multi-branch monitoring capability
6. **Deleted/merged branch** - Complete branch lifecycle management

**Phase 4: Advanced Features**
7. **Repo moved to group** - Important for large org restructuring
8. **Group name change** - Nice to have

**Phase 5: Complex Features (Requires Snyk Platform Support)**
9. **Moved/renamed file** - High effort, unclear Snyk API support
10. **Ecosystem version change** - Requires platform coordination

---

## Effort Summary

| Category | Use Cases | Total Effort |
|----------|-----------|--------------|
| Partial → Full | 2 | 2-3 sprints |
| State Persistence + Basic | 2 | 2-4 sprints |
| Branch Lifecycle | 2 | 3-5 sprints |
| Advanced | 2 | 3-4 sprints |
| Complex (Platform Dependent) | 2 | 7+ sprints |
| **Total** | **10** | **17-23 sprints** |

---

## References

### Source Files

**Sync Core:**
- `internal/sync_types.go` - Core types (`CompareResult`, `BranchUpdate`)
- `internal/sync_compare.go` - State comparison logic
- `internal/sync_helpers.go` - Shared utilities, manifest detection

**SCM-Specific Sync:**
- `internal/sync_github.go` - GitHub sync implementation
- `internal/sync_gitlab.go` - GitLab sync implementation
- `internal/sync_azure.go` - Azure DevOps sync implementation
- `internal/sync_bitbucket_cloud_unified.go` - Bitbucket Cloud sync
- `internal/sync_bitbucketserver.go` - Bitbucket Server sync

**SCM Clients:**
- `internal/github.go` - GitHub API client (has `GetArchived()` check)
- `internal/gitlab.go` - GitLab API client (has `Archived` field)
- `internal/azure.go` - Azure API client (has `IsDisabled` field)
- `internal/bitbucketcloud.go` - Bitbucket Cloud API client
- `internal/bitbucketserver.go` - Bitbucket Server API client

**Snyk API:**
- `internal/snyk.go` - Snyk API client
- `internal/sync_snyk.go` - Snyk project fetching

**CLI:**
- `cmd/sync.go` - Sync command entry point

### API Documentation

- [GitHub REST API - Repositories](https://docs.github.com/en/rest/repos/repos)
- [GitLab REST API - Projects](https://docs.gitlab.com/ee/api/projects.html)
- [Azure DevOps REST API - Repositories](https://docs.microsoft.com/en-us/rest/api/azure/devops/git/repositories)
- [Bitbucket Cloud REST API - Repositories](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/)
- [Bitbucket Server REST API](https://docs.atlassian.com/bitbucket-server/rest/)
- [Snyk REST API - Projects](https://apidocs.snyk.io/)
