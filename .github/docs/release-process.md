# Release Process Guide

## Overview

This project uses **semantic versioning** (SemVer) and automated releases via GitHub Actions and **[GoReleaser](https://goreleaser.com/)**. When you push a version tag, the system automatically:

1. ✅ Validates semantic version format
2. ✅ Runs **golangci-lint** and **`go test ./...`** (same gate style as [snyk-api](https://github.com/sam1el/snyk-api/blob/main/.github/workflows/release.yaml))
3. ✅ Builds via **`.goreleaser.yml`**: linux/darwin/windows × amd64/arm64 (`CGO_ENABLED=0`)
4. ✅ Packages **archives** (default `.tar.gz` / Windows `.zip`) with `LICENSE` and `README.md`, plus `checksums.txt`
5. ✅ Creates the GitHub release and uploads assets
6. ✅ Auto-updates CHANGELOG.md
7. ✅ Commits CHANGELOG back to main branch

---

## Semantic Versioning

### Version Format

**Standard release:** `v1.0.0` (MAJOR.MINOR.PATCH)

- `MAJOR` - Incompatible API changes
- `MINOR` - Backwards-compatible functionality
- `PATCH` - Backwards-compatible bug fixes

**Pre-release:** `v1.0.0-alpha.1`, `v1.0.0-beta.2`, `v1.0.0-rc.1`

### Version Rules

✅ **Valid:**

- `v1.0.0` - Standard release
- `v2.1.3` - Standard release
- `v1.0.0-alpha.1` - Pre-release
- `v2.0.0-beta.3` - Pre-release
- `v1.5.0-rc.1` - Release candidate

❌ **Invalid:**

- `v1.0` - Missing PATCH
- `1.0.0` - Missing `v` prefix
- `v1.0.0.1` - Too many segments
- `v1.0.0_alpha` - Invalid pre-release format

---

## Supported Platforms

GoReleaser builds **one matrix** (same pattern as [snyk-api `.goreleaser.yml`](https://github.com/sam1el/snyk-api/blob/main/.goreleaser.yml)): **linux**, **darwin**, **windows** × **amd64**, **arm64**. Each release archive contains the `snyk-api-import` binary (plus `LICENSE` and `README.md`). Linux binaries use **`CGO_ENABLED=0`** (statically linked, suitable for typical containers including Alpine).

Configuration lives in **`.goreleaser.yml`**. For a local snapshot (requires [`goreleaser`](https://goreleaser.com/install/) v2 on your `PATH`):

```bash
make build-all
```

---

## Release Workflow

### 1. Pre-Release Checklist

Before creating a release tag:

```bash
# Ensure all tests pass
make test

# Run linting
make lint

# Build locally to verify
make build-all

# Review changes since last release
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

### 2. Determine Version Number

#### For MAJOR version (breaking changes):

```bash
# Example: v1.5.3 → v2.0.0
git tag -a v2.0.0 -m "Release v2.0.0 - Breaking: New API structure"
```

#### For MINOR version (new features):

```bash
# Example: v1.5.3 → v1.6.0
git tag -a v1.6.0 -m "Release v1.6.0 - Add Azure DevOps support"
```

#### For PATCH version (bug fixes):

```bash
# Example: v1.5.3 → v1.5.4
git tag -a v1.5.4 -m "Release v1.5.4 - Fix sync comparison bug"
```

#### For PRE-RELEASE:

```bash
# Alpha (early testing)
git tag -a v1.6.0-alpha.1 -m "Release v1.6.0-alpha.1 - Preview Azure support"

# Beta (feature complete, testing)
git tag -a v1.6.0-beta.1 -m "Release v1.6.0-beta.1 - Testing Azure support"

# Release Candidate (final testing)
git tag -a v1.6.0-rc.1 -m "Release v1.6.0-rc.1 - Final testing before release"
```

### 3. Push Tag

```bash
# Push the tag to GitHub
git push origin v1.6.0
```

This triggers the release workflow automatically.

### 4. Monitor Release

Watch the GitHub Actions workflow:

```bash
# URL format
https://github.com/sam1el/snyk-api-import-go/actions
```

**Workflow Steps:**

1. **Validate semver** - Ensures tag format is correct
2. **Build binaries** - Creates 5 platform binaries
3. **Generate checksums** - Creates SHA256 checksums
4. **Generate release notes** - Extracts commit messages since last tag
5. **Create release** - Creates GitHub release with binaries
6. **Update CHANGELOG.md** - Adds entry to CHANGELOG
7. **Commit CHANGELOG** - Pushes CHANGELOG update to main

### 5. Verify Release

After workflow completes:

```bash
# Download and verify (example for macOS)
wget https://github.com/sam1el/snyk-api-import-go/releases/download/v1.6.0/snyk-api-import-darwin-arm64
wget https://github.com/sam1el/snyk-api-import-go/releases/download/v1.6.0/checksums.txt

# Verify checksum
sha256sum -c checksums.txt --ignore-missing

# Test binary
chmod +x snyk-api-import-darwin-arm64
./snyk-api-import-darwin-arm64 version
```

---

## CHANGELOG.md Format

### Auto-Generated Sections

The release workflow automatically categorizes commits:

```markdown
## [v1.6.0] - 2025-01-15

### Added
- feat: Add Azure DevOps integration (abc1234)
- feat: Support custom API URLs (def5678)

### Changed
- refactor: Improve sync performance (ghi9012)
- perf: Optimize manifest discovery (jkl3456)

### Fixed
- fix: Resolve branch mismatch detection (mno7890)
- fix: Handle empty manifests correctly (pqr2345)

### All Changes
- feat: Add Azure DevOps integration (abc1234)
- refactor: Improve sync performance (def5678)
- fix: Resolve branch mismatch detection (ghi9012)
- docs: Update installation guide (jkl3456)
```

### Commit Message Conventions

To get automatic categorization, use conventional commits:

| Prefix | Category | Example |
|--------|----------|---------|
| `feat:` | Added | `feat: add sync command` |
| `fix:` | Fixed | `fix: resolve rate limit bug` |
| `refactor:` | Changed | `refactor: simplify auth logic` |
| `perf:` | Changed | `perf: optimize API calls` |
| `docs:` | All Changes only | `docs: update README` |
| `test:` | All Changes only | `test: add sync tests` |
| `chore:` | All Changes only | `chore: update dependencies` |

**Example commit messages:**

```bash
git commit -m "feat: add GitLab manifest discovery"
git commit -m "fix: handle rate limiting in import"
git commit -m "refactor: improve error handling in sync"
git commit -m "docs: add Azure DevOps setup guide"
```

---

## Manual CHANGELOG Edits

If you need to manually edit CHANGELOG.md:

1. **Edit locally**

   ```bash
   vim CHANGELOG.md
   ```

2. **Commit changes**

   ```bash
   git add CHANGELOG.md
   git commit -m "docs: update CHANGELOG with manual notes"
   git push
   ```

3. **Before next release**
   - The auto-update will preserve your manual edits
   - New entries are inserted after the header, before existing entries

---

## Release Examples

### Example 1: Standard Release

```bash
# Review changes
git log v1.5.0..HEAD --oneline

# Create tag
git tag -a v1.6.0 -m "Release v1.6.0 - Add Azure DevOps support"

# Push tag
git push origin v1.6.0

# Wait for Actions to complete (~5 minutes)
# Check release: https://github.com/sam1el/snyk-api-import-go/releases/tag/v1.6.0
```

### Example 2: Hotfix Release

```bash
# Fix critical bug on main
git commit -m "fix: critical sync bug causing data loss"

# Create patch release
git tag -a v1.6.1 -m "Release v1.6.1 - Hotfix for sync bug"

# Push immediately
git push origin v1.6.1
```

### Example 3: Pre-Release for Testing

```bash
# Create alpha for early testing
git tag -a v2.0.0-alpha.1 -m "Release v2.0.0-alpha.1 - Testing new API"

# Push
git push origin v2.0.0-alpha.1

# Users can test with: --prerelease flag
```

---

## Troubleshooting

### "Invalid semantic version" Error

**Error:**

```bash
❌ Invalid semantic version: v1.0
Expected format: v1.0.0 or v1.0.0-alpha.1
```

**Solution:**

```bash
# Delete bad tag
git tag -d v1.0
git push origin :refs/tags/v1.0

# Create correct tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### Build Fails

**Check logs:**

```bash
# View GitHub Actions logs
https://github.com/sam1el/snyk-api-import-go/actions
```

**Common issues:**

- Compilation errors → Fix code and push fix, then retag
- Test failures → Fix tests before creating tag
- Linting errors → Run `make lint` locally first

### CHANGELOG Not Updated

**Check:**

1. Workflow completed successfully
2. No conflicts in CHANGELOG.md
3. GitHub Actions bot has write permissions

**Manual fix:**

```bash
# Pull latest CHANGELOG
git pull origin main

# If missing entry, add manually
vim CHANGELOG.md

# Commit
git commit -m "docs: manually update CHANGELOG for v1.6.0"
git push
```

### Release Already Exists

**Error:**

```
Release v1.6.0 already exists
```

**Solution:**

```bash
# Option 1: Delete and recreate (if release is wrong)
# Go to GitHub Releases UI, delete release and tag
gh release delete v1.6.0
git push origin :refs/tags/v1.6.0
git tag -a v1.6.0 -m "Release v1.6.0 - Corrected"
git push origin v1.6.0

# Option 2: Create new patch version
git tag -a v1.6.1 -m "Release v1.6.1"
git push origin v1.6.1
```

---

## Local Testing

Before pushing a tag, test the build locally:

```bash
# Test all platforms build
make build-all

# Inspect snapshot output (layout under dist/ is created by GoReleaser)
find dist -type f | sort
# GitHub Releases publish archives (e.g. *.tar.gz / *.zip) plus checksums.txt — see each release’s Assets list.

# Test version injection
VERSION=v1.6.0-test GIT_COMMIT=$(git rev-parse --short HEAD) BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) make build
./snyk-api-import version
# Should show: snyk-api-import v1.6.0-test
```

---

## Best Practices

### DO ✅

1. **Test before releasing**

   ```bash
   make check  # Runs fmt, vet, lint, test-short
   ```

2. **Use meaningful tag messages**

   ```bash
   git tag -a v1.6.0 -m "Release v1.6.0 - Add Azure DevOps integration"
   ```

3. **Follow SemVer strictly**
   - Breaking changes → MAJOR
   - New features → MINOR
   - Bug fixes → PATCH

4. **Use conventional commits**

   ```bash
   feat: add new feature
   fix: resolve bug
   docs: update documentation
   ```

5. **Test pre-releases first**

   ```bash
   v2.0.0-alpha.1 → v2.0.0-beta.1 → v2.0.0-rc.1 → v2.0.0
   ```

### DON'T ❌

1. **Don't skip versions**
   ❌ v1.0.0 → v1.2.0 (skip v1.1.0)
   ✅ v1.0.0 → v1.1.0 → v1.2.0

2. **Don't reuse tags**
   ❌ Delete and recreate same version
   ✅ Create new patch version

3. **Don't push untested code**
   ❌ Tag immediately after commit
   ✅ Test locally, review, then tag

4. **Don't use vague tag messages**
   ❌ `git tag -a v1.6.0 -m "new version"`
   ✅ `git tag -a v1.6.0 -m "Release v1.6.0 - Add Azure DevOps support"`

---

## Quick Reference

### Creating a Release

```bash
# Standard workflow
make check                          # Test everything
git log --oneline HEAD...v1.5.0     # Review changes
git tag -a v1.6.0 -m "Release v1.6.0 - Add feature X"
git push origin v1.6.0              # Trigger release
```

### Checking Release Status

```bash
# View releases
gh release list

# View specific release
gh release view v1.6.0

# Download release asset
gh release download v1.6.0
```

### Rolling Back a Release

```bash
# Delete release (GitHub UI or CLI)
gh release delete v1.6.0 --yes

# Delete tag
git tag -d v1.6.0
git push origin :refs/tags/v1.6.0
```

---

## Integration with CI/CD

The release process is fully automated via `.github/workflows/release.yml`.

**Workflow triggers:**

- Any tag matching `v[0-9]+.[0-9]+.[0-9]+`
- Any tag matching `v[0-9]+.[0-9]+.[0-9]+-*`

**Permissions required:**

- `contents: write` - For creating releases and committing CHANGELOG

**Secrets used:**

- `GITHUB_TOKEN` - Auto-provided by GitHub Actions

---

## Support

For issues with the release process:

1. Check [GitHub Actions logs](https://github.com/sam1el/snyk-api-import-go/actions)
2. Review [release workflow](.github/workflows/release.yml)
3. Check [CHANGELOG.md](../CHANGELOG.md) for recent changes
4. Open an issue with `release` label

---

**Last Updated:** 2025-11-12
**Next Review:** When major changes to release process occur
