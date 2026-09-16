# Automated Release Workflows

## Overview

Three automated release workflows are available:

1. **Auto-Tag on Merge** - Automatically creates tags when PRs are merged with specific labels
2. **Manual Release** - Trigger releases via GitHub UI with version selection
3. **Manual Push** - Traditional manual tag creation (still supported)

---

## Option 1: Auto-Tag on Merge (Recommended)

### How it works

1. Create PR with your changes
2. Add a release label (`release:major`, `release:minor`, `release:patch`, etc.)
3. Merge PR to main
4. Tag is automatically created
5. Release workflow automatically triggers

### Labels

| Label | Version Bump | Example | Use Case |
|-------|-------------|---------|----------|
| `release:major` | MAJOR | v1.5.3 → **v2.0.0** | Breaking changes |
| `release:minor` | MINOR | v1.5.3 → **v1.6.0** | New features |
| `release:patch` | PATCH | v1.5.3 → **v1.5.4** | Bug fixes |
| `release:alpha` | Pre-release | v1.5.3 → **v1.6.0-alpha.1** | Early testing |
| `release:beta` | Pre-release | v1.5.3 → **v1.6.0-beta.1** | Feature complete |
| `release:rc` | Pre-release | v1.5.3 → **v1.6.0-rc.1** | Release candidate |

### Setup

**Automatic (Recommended):**

Labels are automatically created when you push to main! ✨

The workflow `.github/workflows/setup-labels.yml` syncs labels from `.github/labels.yml`.

**Just push your changes:**
```bash
git add .
git commit -m "Add automated release workflows"
git push origin main

# ✅ Labels created automatically on first push!
```

**Manual trigger if needed:**
```bash
# Via GitHub UI: Actions → Setup Repository Labels → Run workflow
# Via CLI:
gh workflow run setup-labels.yml
```

**Manual creation (alternative):**
```bash
# If you prefer to create labels manually:
gh label create "release:major" --color "d73a4a" --description "Major release"
gh label create "release:minor" --color "0e8a16" --description "Minor release"
gh label create "release:patch" --color "fbca04" --description "Patch release"
gh label create "release:alpha" --color "d876e3" --description "Alpha release"
gh label create "release:beta" --color "d876e3" --description "Beta release"
gh label create "release:rc" --color "d876e3" --description "RC release"
```

**Workflows already in place:**
- ✅ `.github/workflows/setup-labels.yml` - Auto-creates labels
- ✅ `.github/workflows/auto-tag.yml` - Auto-tags on merge
- ✅ `.github/workflows/manual-release.yml` - Manual releases

### Usage Example

```bash
# 1. Create feature branch
git checkout -b feature/azure-devops
git commit -m "feat: add Azure DevOps integration"
git push origin feature/azure-devops

# 2. Create PR on GitHub
gh pr create --title "Add Azure DevOps integration" --body "Implements #123"

# 3. Add release label (via GitHub UI or CLI)
gh pr edit --add-label "release:minor"

# 4. Merge PR
gh pr merge --squash

# ✅ Automatic flow:
# - Auto-tag workflow triggers
# - Creates tag v1.6.0
# - Comments on PR with release info
# - Release workflow triggers
# - Builds and publishes release
```

### Workflow Output

When PR is merged, you'll see:

**PR Comment:**

```bash
🚀 Release v1.6.0 triggered!

This PR has been automatically tagged and will be released shortly.

- 📦 Tag: v1.6.0
- 🔗 View Release Workflow
- 📋 CHANGELOG.md will be automatically updated

The release should be available in ~5 minutes.
```

**GitHub Actions:**

1. `Auto Tag on Merge` - Creates tag
2. `Release` - Builds and publishes

---

## Option 2: Manual Release via UI

### How it works

1. Go to GitHub Actions
2. Select "Manual Release" workflow
3. Click "Run workflow"
4. Select version bump type or enter custom version
5. Release is created automatically

### Usage

**Via GitHub UI:**

1. Navigate to: `Actions → Manual Release → Run workflow`
2. Select branch: `main`
3. Choose version type:
   - `major` - v1.5.3 → v2.0.0
   - `minor` - v1.5.3 → v1.6.0
   - `patch` - v1.5.3 → v1.5.4
   - `alpha` - v1.5.3 → v1.6.0-alpha.1
   - `beta` - v1.5.3 → v1.6.0-beta.1
   - `rc` - v1.5.3 → v1.6.0-rc.1
4. Or enter custom version (e.g., `v2.1.0` or `v2.1.0-alpha.3`)
5. Click "Run workflow"

**Via GitHub CLI:**

```bash
# Trigger minor release
gh workflow run manual-release.yml -f version_type=minor

# Trigger alpha release
gh workflow run manual-release.yml -f version_type=alpha

# Trigger custom version
gh workflow run manual-release.yml -f custom_version=v2.1.0

# Trigger custom pre-release
gh workflow run manual-release.yml -f custom_version=v2.1.0-beta.5
```

### Custom Version Format

When using custom version:
- ✅ `v1.0.0` - Valid
- ✅ `1.0.0` - Valid (v prefix added automatically)
- ✅ `v1.0.0-alpha.1` - Valid pre-release
- ❌ `v1.0` - Invalid (must be MAJOR.MINOR.PATCH)

---

## Option 3: Manual Tag Push (Traditional)

Still supported for direct control:

```bash
# Create and push tag manually
git tag -a v1.6.0 -m "Release v1.6.0 - Add Azure DevOps"
git push origin v1.6.0
```

This triggers the release workflow immediately.

---

## Comparison

| Method | Control | Automation | Best For |
|--------|---------|------------|----------|
| **Auto-Tag on Merge** | Medium | High | Regular development workflow |
| **Manual Release UI** | High | High | Ad-hoc releases, hotfixes |
| **Manual Tag Push** | Full | None | Special cases, emergency fixes |

---

## Complete Flow Comparison

### Auto-Tag on Merge

```
PR created → Add label → Merge PR
    ↓
Auto-tag workflow runs
    ↓
Tag created (v1.6.0)
    ↓
Release workflow triggered
    ↓
Binaries built + Release published
    ↓
CHANGELOG updated
```

### Manual Release UI

```
Navigate to Actions → Select Manual Release → Choose version
    ↓
Manual release workflow runs
    ↓
Tag created (v1.6.0)
    ↓
Release workflow triggered
    ↓
Binaries built + Release published
    ↓
CHANGELOG updated
```

### Manual Tag Push

```
Create tag locally → Push to GitHub
    ↓
Release workflow triggered
    ↓
Binaries built + Release published
    ↓
CHANGELOG updated
```

---

## Pre-release Progression Example

Using **Auto-Tag on Merge**:

```bash
# 1. Alpha release
# PR #1: Initial feature implementation
# Label: release:alpha
# Merge → Creates v1.6.0-alpha.1

# 2. More alpha iterations
# PR #2: Fix alpha issues
# Label: release:alpha
# Merge → Creates v1.6.0-alpha.2

# 3. Beta release
# PR #3: Feature complete
# Label: release:beta
# Merge → Creates v1.6.0-beta.1

# 4. Release candidate
# PR #4: Final testing
# Label: release:rc
# Merge → Creates v1.6.0-rc.1

# 5. Stable release
# PR #5: Ready for production
# Label: release:minor
# Merge → Creates v1.6.0
```

---

## Version Calculation Logic

### Automatic Version Bumping

All workflows use the same logic:

```bash
# Get latest tag (e.g., v1.5.3)
LATEST_TAG=$(git describe --tags --abbrev=0)

# Parse version
VERSION=${LATEST_TAG#v}         # Remove 'v' → 1.5.3
VERSION=${VERSION%%-*}          # Remove pre-release → 1.5.3
IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"

# Bump based on type
case $TYPE in
  major)  v2.0.0 ;;
  minor)  v1.6.0 ;;
  patch)  v1.5.4 ;;
  alpha)  v1.6.0-alpha.1 ;;
  beta)   v1.6.0-beta.1 ;;
  rc)     v1.6.0-rc.1 ;;
esac
```

### Pre-release Numbering

Pre-release numbers auto-increment:

```bash
# If v1.6.0-alpha.1 exists
# Next alpha → v1.6.0-alpha.2

# If v1.6.0-beta.1 exists
# Next beta → v1.6.0-beta.2
```

---

## Best Practices

### DO ✅

1. **Use labels for regular releases**
   ```bash
   # Most PRs should have a release label
   gh pr create --label "release:minor"
   ```

2. **Use manual UI for hotfixes**
   ```bash
   # Quick patch release
   gh workflow run manual-release.yml -f version_type=patch
   ```

3. **Use consistent pre-release flow**
   ```bash
   alpha → beta → rc → stable
   ```

4. **Test pre-releases before stable**
   ```bash
   # Don't skip straight to stable for major changes
   release:alpha → ... → release:minor
   ```

### DON'T ❌

1. **Don't mix methods randomly**
   - Pick one primary method and stick with it

2. **Don't skip version numbers**
   - Let the automation handle version bumps

3. **Don't create tags without labels** (if using auto-tag)
   - Always add a release label to PRs

4. **Don't manually edit versions after automation**
   - Trust the calculated version

---

## Troubleshooting

### "Tag already exists"

**Problem:** Trying to create a tag that already exists

**Solution:**
```bash
# Check existing tags
git tag -l

# If you need to re-release, create a patch
# Instead of v1.6.0, create v1.6.1
```

### "No release label found"

**Problem:** PR merged without release label

**Solution:**
```bash
# Manually trigger release
gh workflow run manual-release.yml -f version_type=patch
```

### "Invalid semantic version"

**Problem:** Custom version doesn't match SemVer format

**Solution:**
```bash
# Ensure format: v1.0.0 or v1.0.0-alpha.1
# ❌ v1.0
# ✅ v1.0.0

# ❌ v1.0.0_beta
# ✅ v1.0.0-beta.1
```

### "Workflow didn't trigger"

**Problem:** Release workflow didn't start after tag creation

**Solution:**
```bash
# Check tag was pushed
git ls-remote --tags origin

# Check workflow file exists
ls .github/workflows/release.yml

# Manually trigger if needed
gh workflow run manual-release.yml
```

---

## Migration Guide

### From Manual to Auto-Tag

**Before:**
```bash
git tag -a v1.6.0 -m "Release"
git push origin v1.6.0
```

**After:**
```bash
# Just add label to PR
gh pr edit --add-label "release:minor"
gh pr merge
# ✅ Tag created automatically
```

### From Auto-Tag to Manual UI

**Before:**
```bash
# Create PR, add label, merge
gh pr create --label "release:minor"
gh pr merge
```

**After:**
```bash
# Just trigger workflow
gh workflow run manual-release.yml -f version_type=minor
```

---

## Configuration

### Change Default Behavior

**Auto-tag workflow triggers:**

```yaml
# .github/workflows/auto-tag.yml
on:
  pull_request:
    types: [closed]
    branches:
      - main        # Change to your default branch
```

**Customize version calculation:**

Edit the version bump logic in:
- `.github/workflows/auto-tag.yml`
- `.github/workflows/manual-release.yml`

**Change label names:**

```yaml
# In auto-tag.yml, change:
if echo "$LABELS" | grep -q "release:major"; then
# To:
if echo "$LABELS" | grep -q "version:major"; then
```

---

## Security Considerations

### Permissions

All workflows require:

```yaml
permissions:
  contents: write  # For creating and pushing tags
```

### Branch Protection

Recommended settings:
- ✅ Require pull request reviews
- ✅ Require status checks to pass
- ✅ Require branches to be up to date
- ✅ Include administrators

This ensures:
- Only reviewed code gets released
- Tests pass before tagging
- No accidental releases

---

## Quick Reference

### Setup Labels (One-Time)

**Automatic (recommended):**
```bash
# Labels are created automatically when you push to main
git push origin main

# Or trigger manually
gh workflow run setup-labels.yml
```

**Manual (alternative):**
```bash
gh label create "release:major" --color "d73a4a"
gh label create "release:minor" --color "0e8a16"
gh label create "release:patch" --color "fbca04"
gh label create "release:alpha" --color "d876e3"
gh label create "release:beta" --color "d876e3"
gh label create "release:rc" --color "d876e3"
```

### Update Labels

Edit `.github/labels.yml` and push to main:
```bash
vim .github/labels.yml
git add .github/labels.yml
git commit -m "Update release labels"
git push origin main
# ✅ Labels synced automatically
```

### Trigger Manual Release

```bash
# Via CLI
gh workflow run manual-release.yml -f version_type=minor
gh workflow run manual-release.yml -f custom_version=v2.0.0

# Via API
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows/manual-release.yml/dispatches \
  -d '{"ref":"main","inputs":{"version_type":"minor"}}'
```

### Check Workflow Status

```bash
# List recent runs
gh run list --workflow=auto-tag.yml
gh run list --workflow=manual-release.yml
gh run list --workflow=release.yml

# View specific run
gh run view RUN_ID
```

---

**Last Updated:** 2025-11-12
**Workflows:** `.github/workflows/auto-tag.yml`, `.github/workflows/manual-release.yml`
