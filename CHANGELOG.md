# Changelog



## [v2.1.3](https://github.com/snyk/snyk-api-import/releases/tag/v2.1.3) - 2026-04-30

### 🐛 Bug Fixes

- Merge pull request #34 from snyk/fix/goreleaser ([#34](https://github.com/snyk/snyk-api-import/pull/34))
- fixing go releaser ([ff7bf9f](https://github.com/snyk/snyk-api-import/commit/ff7bf9f))
- Merge pull request #33 from snyk/fix/user-agent-versioning ([#33](https://github.com/snyk/snyk-api-import/pull/33))
- fixing go releaser ([f2114e1](https://github.com/snyk/snyk-api-import/commit/f2114e1))

<details>
<summary>🔧 Other Changes</summary>

- chore: remove accidental internal/logs from repo and gitignore ([b3b56e8](https://github.com/snyk/snyk-api-import/commit/b3b56e8))

</details>

**Full Changelog**: [v2.1.2...v2.1.3](https://github.com/snyk/snyk-api-import/compare/v2.1.2...v2.1.3)



## [v2.1.2](https://github.com/snyk/snyk-api-import/releases/tag/v2.1.2) - 2026-04-23

### 🐛 Bug Fixes

- fixing e2e tests for new api issues ([eaaaefe](https://github.com/snyk/snyk-api-import/commit/eaaaefe))
- Merge pull request #30 from snyk/chore/spec-updates ([#30](https://github.com/snyk/snyk-api-import/pull/30))

**Full Changelog**: [v2.1.1...v2.1.2](https://github.com/snyk/snyk-api-import/compare/v2.1.1...v2.1.2)



## [v2.1.1](https://github.com/snyk/snyk-api-import/releases/tag/v2.1.1) - 2026-02-25

**Full Changelog**: [v2.1.0...v2.1.1](https://github.com/snyk/snyk-api-import/compare/v2.1.0...v2.1.1)



## [v2.1.0](https://github.com/snyk/snyk-api-import/releases/tag/v2.1.0) - 2025-12-03

### ✨ Features

- Merge pull request #27 from snyk/feature/centralized-rate-limiting ([#27](https://github.com/snyk/snyk-api-import/pull/27))

### 🐛 Bug Fixes

- fix: address polling false failures and simplify rate limiter singleton ([1cc4793](https://github.com/snyk/snyk-api-import/commit/1cc4793))

**Full Changelog**: [v2.0.3...v2.1.0](https://github.com/snyk/snyk-api-import/compare/v2.0.3...v2.1.0)



## [v2.0.3] - 2025-12-02

### Added

### Changed

### Fixed
- Merge pull request #26 from snyk/fix/regional-endpoint-support (349fa89)
- fix: add regional Snyk API endpoint support (b13210c)
### All Changes
- Merge pull request #26 from snyk/fix/regional-endpoint-support (349fa89)
- fix: add regional Snyk API endpoint support (b13210c)
- chore: update CHANGELOG.md for v2.0.2 (e68104d)


## [v2.0.2] - 2025-11-26

### Added

### Changed
- Merge pull request #25 from snyk/refactor/consolidate-bitbucket-implementations (c9dd9b9)
- refactor: consolidate Bitbucket Cloud implementations (0ef182a)
### Fixed
- fix: use type conversion instead of struct literal (2a680d3)
### All Changes
- Merge pull request #25 from snyk/refactor/consolidate-bitbucket-implementations (c9dd9b9)
- fix: use type conversion instead of struct literal (2a680d3)
- refactor: consolidate Bitbucket Cloud implementations (0ef182a)
- Merge pull request #24 from snyk/docs/update-documentation (75987d4)
- docs: update documentation to align with current implementation (3ef4a07)
- chore: update CHANGELOG.md for v2.0.1 (097e068)


## [v2.0.1] - 2025-11-26

### Added

### Changed

### Fixed
- Merge pull request #23 from snyk/fix/github-cloud-app-sync-auth (43e165d)
- fix: require correct authentication for github-cloud-app source (e55cfa6)
### All Changes
- Merge pull request #23 from snyk/fix/github-cloud-app-sync-auth (43e165d)
- fix: require correct authentication for github-cloud-app source (e55cfa6)
- chore: update CHANGELOG.md for v2.0.0 (5d34e8f)


## [v2.0.0] - 2025-11-25

### Added
- feat: standardize --source default and add import file validation (43a0c9f)
### Changed
- refactor: standardize on optimized sync and parallel import methods (daffc7b)
### Fixed

### All Changes
- Merge pull request #22 from snyk/refactor/optimize-sync-default (4b0611b)
- feat: standardize --source default and add import file validation (43a0c9f)
- test: fix broken tests and improve coverage (125a3ae)
- docs: clarify git operation approval requirements in .cursorrules (8e38804)
- refactor: standardize on optimized sync and parallel import methods (daffc7b)
- chore: update CHANGELOG.md for v1.1.0 (15ca336)


## [v1.1.0] - 2025-11-24

### Added
- Merge pull request #21 from snyk/feat/improve-cli-help-text (5b0b6eb)
- feat: enhance CLI help text with comprehensive command documentation (1c7bf94)
### Changed

### Fixed

### All Changes
- Merge pull request #21 from snyk/feat/improve-cli-help-text (5b0b6eb)
- feat: enhance CLI help text with comprehensive command documentation (1c7bf94)
- Merge pull request #19 from snyk/docs/comprehensive-config-example (3a1564a)
- docs: enhance config.toml.example with comprehensive org_id explanations (f1ae142)
- chore: update CHANGELOG.md for v1.0.1 (903ea84)


## [v1.0.1] - 2025-11-24

### Added

### Changed

### Fixed
- Merge pull request #18 from snyk/fix/cli-flag-compatibility (f203dcd)
- fix: remove broken installation instructions from release notes (c05a4c0)
- fix: align CLI flag defaults with TypeScript for customer compatibility (1de9e1a)
### All Changes
- Merge pull request #18 from snyk/fix/cli-flag-compatibility (f203dcd)
- fix: remove broken installation instructions from release notes (c05a4c0)
- fix: align CLI flag defaults with TypeScript for customer compatibility (1de9e1a)
- chore: update CHANGELOG.md for v1.0.0 (06d17b7)


## [v1.0.0] - 2025-11-24

### Added
- Merge pull request #17 from snyk/refactor/optimize-and-deduplicate (9110fd0)
- feat(import): add --import-all safety flag and parallel file imports (7056e8d)
- feat(config): add per-integration org_id support (4854296)
- feat: add --concurrency CLI flag for import and sync commands (ea4fc57)
- feat: implement parallel import for all sync integrations (b9d95cc)
### Changed
- refactor(import): implement ParallelImport() for all integrations (4378391)
- refactor(import): use ParallelImport() for Bitbucket Cloud --workspaces (1cfbea7)
### Fixed
- fix: resolve GitHub App auth and Azure optimized sync issues (b284bca)
- fix: resolve Azure DevOps optimized sync 404 errors (aadd9e5)
- fix(orgs): enable CreateOrg to use token from config.toml (9728fa9)
- fix(logging): rename Logger interface to Interface to avoid name collision (ac12e39)
- fix(import): restore writeResults function for test compatibility (a8a5d91)
- fix: apply integration config from TOML in import command (a4024f8)
- fix: add SNYK_LOG_PATH to all E2E jobs (076454b)
### All Changes
- Merge pull request #17 from snyk/refactor/optimize-and-deduplicate (9110fd0)
- fix: resolve GitHub App auth and Azure optimized sync issues (b284bca)
- test: improve E2E standalone sync tests with scoped targets (e5dc51f)
- fix: resolve Azure DevOps optimized sync 404 errors (aadd9e5)
- test: deduplicate and streamline E2E tests (bb19f39)
- test: refactor and deduplicate test code (1990869)
- fix(orgs): enable CreateOrg to use token from config.toml (9728fa9)
- fix(logging): rename Logger interface to Interface to avoid name collision (ac12e39)
- fix(import): restore writeResults function for test compatibility (a8a5d91)
- feat(import): add --import-all safety flag and parallel file imports (7056e8d)
- refactor(import): implement ParallelImport() for all integrations (4378391)
- feat(config): add per-integration org_id support (4854296)
- refactor(import): use ParallelImport() for Bitbucket Cloud --workspaces (1cfbea7)
- fix: apply integration config from TOML in import command (a4024f8)
- feat: add --concurrency CLI flag for import and sync commands (ea4fc57)
- feat: implement parallel import for all sync integrations (b9d95cc)
- initial optimizations (a3633e1)
- Merge remote-tracking branch 'origin/main' into chore/optimize (276b02b)
- fix: add SNYK_LOG_PATH to all E2E jobs (076454b)
- chore: update CHANGELOG.md for v0.4.0 (7e1cf52)
- begining thoughts on optimizations (eb3056a)


## [v0.4.0] - 2025-11-17

### Added
- Merge pull request #16 from snyk/feature/toml-config (4c043ad)
- feat: add TOML configuration file support (9125f1b)
### Changed

### Fixed
- fix: address Copilot PR review feedback (23f1d91)
- fix: improve TestMergeWithEnv test isolation (7dd1984)
### All Changes
- Merge pull request #16 from snyk/feature/toml-config (4c043ad)
- fix: address Copilot PR review feedback (23f1d91)
- chore: optimize CI to avoid duplicate runs (b694416)
- style: apply go fmt to config_toml_test.go (18e07f3)
- fix: improve TestMergeWithEnv test isolation (7dd1984)
- style: run go fmt on new files (1f33ffa)
- feat: add TOML configuration file support (9125f1b)
- Update CHANGELOG by removing Unreleased section (c1c4fb2)
- chore: update CHANGELOG.md for v0.3.1 (316ae6b)


## [v0.3.1] - 2025-11-17

### Added

### Changed

### Fixed
- fix: Add tag_name to release action for workflow_dispatchFix/release workflow tag (#15) (ac454b3)
### All Changes
- fix: Add tag_name to release action for workflow_dispatchFix/release workflow tag (#15) (ac454b3)


## [v0.2.0-alpha.1] - 2025-11-17

### Added
- feat: Add Bitbucket Server Integration (#12) (ba49e53)
### Changed

### Fixed
- feat: Add Bitbucket Server Integration (#12) (ba49e53)
### All Changes
- feat: Add Bitbucket Server Integration (#12) (ba49e53)
- chore: update CHANGELOG.md for v0.1.0-alpha.1 (55b97f0)


## [v0.1.0-alpha.1] - 2025-11-14

### Initial Release

First release of snyk-api-import-go

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### Added

- Initial Go implementation of snyk-api-import
- Support for GitHub, GitHub Enterprise, GitHub Cloud App
- Support for GitLab (cloud and self-managed)
- Support for Bitbucket Cloud and Bitbucket Cloud App
- Support for Azure DevOps
- Comprehensive CI/CD pipeline with GitHub Actions
- Multi-platform builds (Linux, Linux Alpine, macOS, Windows)
- Semantic versioning enforcement
- Automatic CHANGELOG.md updates
- Full test coverage strategy with e2e testing framework
- golangci-lint integration with 13 linters
- Coverage reporting and threshold checks
- Version command showing build info

### Changed

- Migrated from TypeScript to Go for better performance and deployment
- Simplified authentication setup
- Improved documentation structure

### Security

- SSRF protection for external API calls
- Path traversal protection for file operations
- Secure credential handling via environment variables
