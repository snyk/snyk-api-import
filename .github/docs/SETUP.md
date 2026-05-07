# Quick Setup Guide

Get up and running with automated releases in 5 minutes.

---

## 1. Clone and Push (One-Time Setup)

```bash
# Clone your repository
git clone https://github.com/sam1el/snyk-api-import-go
cd snyk-api-import-go

# Verify workflow files exist
ls .github/workflows/
# Should see:
# - setup-labels.yml     ✅ (creates labels automatically)
# - auto-tag.yml         ✅ (creates tags on PR merge)
# - manual-release.yml   ✅ (manual release trigger)
# - release.yml          ✅ (builds and publishes)
# - ci.yml               ✅ (testing and linting)

# Push to main (triggers label creation)
git push origin main

# ✅ Labels are created automatically!
# Check: https://github.com/YOUR_REPO/labels
```

**That's it!** Labels are now configured. ✨

---

## 2. Create Your First Release

### Option A: Via PR Label (Recommended)

```bash
# Create a feature branch
git checkout -b feature/my-feature
echo "# My Feature" > feature.txt
git add feature.txt
git commit -m "feat: add my feature"
git push origin feature/my-feature

# Create PR with release label
gh pr create \
  --title "Add my feature" \
  --body "Implements cool feature" \
  --label "release:minor"

# Review and merge
gh pr merge

# ✅ Automatic flow:
# 1. Tag v1.0.0 created
# 2. Binaries built (5 platforms including Alpine)
# 3. GitHub release created
# 4. CHANGELOG.md updated
# 5. Release published
```

### Option B: Via GitHub UI

```bash
# 1. Go to: Actions → Manual Release
# 2. Click: Run workflow
# 3. Select: version_type = "minor"
# 4. Click: Run workflow

# ✅ Release created automatically!
```

### Option C: Manual Tag (Traditional)

```bash
git tag -a v1.0.0 -m "Release v1.0.0 - Initial release"
git push origin v1.0.0

# ✅ Release workflow triggered!
```

---

## 3. Verify Everything Works

```bash
# Check labels were created
gh label list | grep release:

# Should show:
# release:major
# release:minor
# release:patch
# release:alpha
# release:beta
# release:rc

# Check workflows
gh workflow list

# Should show:
# Auto Tag on Merge
# CI
# Manual Release
# Release
# Setup Repository Labels

# Check latest release
gh release list
```

---

## 4. Daily Workflow

### For Feature Development

```bash
# 1. Create branch
git checkout -b feature/azure-support

# 2. Make changes
git commit -m "feat: add Azure DevOps integration"

# 3. Push and create PR with release label
git push origin feature/azure-support
gh pr create --label "release:minor"

# 4. After review, merge
gh pr merge

# ✅ Release v1.1.0 created automatically!
```

### For Bug Fixes

```bash
# Use release:patch label
gh pr create --label "release:patch"
gh pr merge

# ✅ Release v1.1.1 created automatically!
```

### For Pre-releases

```bash
# Alpha testing
gh pr create --label "release:alpha"
gh pr merge
# ✅ Creates v1.2.0-alpha.1

# Beta testing
gh pr create --label "release:beta"
gh pr merge
# ✅ Creates v1.2.0-beta.1

# Release candidate
gh pr create --label "release:rc"
gh pr merge
# ✅ Creates v1.2.0-rc.1

# Final release
gh pr create --label "release:minor"
gh pr merge
# ✅ Creates v1.2.0
```

---

## 5. Customization (Optional)

### Change Label Names

Edit `.github/labels.yml`:

```yaml
- name: "version:major"  # Changed from release:major
  color: "d73a4a"
  description: "Breaking changes"
```

Then update `.github/workflows/auto-tag.yml`:

```yaml
if echo "$LABELS" | grep -q "version:major"; then  # Changed
```

Push changes:

```bash
git add .github/labels.yml .github/workflows/auto-tag.yml
git commit -m "chore: rename release labels"
git push origin main
# ✅ Labels synced automatically
```

### Add Custom Labels

Edit `.github/labels.yml`:

```yaml
- name: "release:hotfix"
  color: "ff0000"
  description: "Emergency hotfix release"
```

Push to sync:

```bash
git push origin main
```

### Disable Auto-Tag

If you only want manual releases:

```bash
# Remove or rename the workflow file
mv .github/workflows/auto-tag.yml .github/workflows/auto-tag.yml.disabled
git add .
git commit -m "chore: disable auto-tagging"
git push origin main
```

---

## 6. Troubleshooting

### "Labels not created"

**Check workflow ran:**
```bash
gh run list --workflow=setup-labels.yml
gh run view <RUN_ID>
```

**Trigger manually:**
```bash
gh workflow run setup-labels.yml
```

**Create manually (fallback):**
```bash
gh label create "release:major" --color "d73a4a"
gh label create "release:minor" --color "0e8a16"
gh label create "release:patch" --color "fbca04"
gh label create "release:alpha" --color "d876e3"
gh label create "release:beta" --color "d876e3"
gh label create "release:rc" --color "d876e3"
```

### "Auto-tag didn't trigger"

**Check PR had release label:**
```bash
gh pr view <PR_NUMBER>
# Should show label in the list
```

**Check workflow ran:**
```bash
gh run list --workflow=auto-tag.yml
```

**Trigger manual release instead:**
```bash
gh workflow run manual-release.yml -f version_type=minor
```

### "Release workflow failed"

**Check logs:**
```bash
gh run list --workflow=release.yml
gh run view <RUN_ID> --log
```

**Common issues:**
- Build errors → Fix code and retag
- Test failures → Fix tests before tagging
- Permission issues → Check `contents: write` permission

### "Wrong version created"

**If wrong tag created:**
```bash
# Delete tag locally and remotely
git tag -d v1.1.0
git push origin :refs/tags/v1.1.0

# Delete release on GitHub
gh release delete v1.1.0 --yes

# Create correct version
gh workflow run manual-release.yml -f custom_version=v1.2.0
```

---

## Summary: What You Get

✅ **Automatic label creation** - No manual setup needed
✅ **Automatic tag creation** - Via PR labels or UI
✅ **Automatic versioning** - Smart version bumping
✅ **5 platform builds** - Linux, Alpine, macOS, Windows
✅ **SHA256 checksums** - Verify downloads
✅ **Auto-updated CHANGELOG** - Always current
✅ **Pre-release support** - Alpha, beta, RC
✅ **Manual control** - UI or CLI when needed

---

## File Structure

```
.github/
├── labels.yml                      # Label definitions
└── workflows/
    ├── setup-labels.yml           # Auto-creates labels
    ├── auto-tag.yml               # Auto-tags on PR merge
    ├── manual-release.yml         # Manual release trigger
    ├── release.yml                # Builds and publishes
    └── ci.yml                     # Testing and linting

docs/
├── SETUP.md                       # This file (quick start)
├── automated-releases.md          # Complete automation guide
└── release-process.md             # Release process details

Makefile                           # Build commands
CHANGELOG.md                       # Auto-maintained changelog
```

---

## Next Steps

1. ✅ **Push to main** - Labels created automatically
2. ✅ **Create first PR** - Add `release:minor` label
3. ✅ **Merge PR** - Release v1.0.0 created
4. ✅ **Check release** - Verify binaries published
5. ✅ **Download & test** - Confirm checksums match

---

## Quick Commands Reference

```bash
# Setup (one-time)
git push origin main                                    # Creates labels

# Create release via PR
gh pr create --label "release:minor"                    # New feature
gh pr create --label "release:patch"                    # Bug fix
gh pr create --label "release:alpha"                    # Pre-release
gh pr merge                                             # Triggers release

# Create release via UI
gh workflow run manual-release.yml -f version_type=minor

# Create release manually
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Check status
gh label list | grep release                            # List labels
gh run list --workflow=release.yml                      # Check releases
gh release list                                         # View releases

# Build locally
make build                                              # Current platform
make build-all                                          # All platforms
make test                                               # Run tests
make check                                              # All checks
```

---

**Setup time:** ~5 minutes
**First release:** Immediately after setup
**Future releases:** Automatic on PR merge or manual via UI

**Ready to release? Push to main!** 🚀
