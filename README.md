
# snyk-api-import (Go)

Snyk API Import is a powerful command-line tool for bulk importing and syncing
repositories from various source control systems into Snyk. This Go
implementation provides enhanced performance and easier deployment compared to
the original TypeScript version.

**Original TypeScript version:**
<https://github.com/snyk/snyk-api-import>

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Supported Integrations](#supported-integrations)
- [Contributing](#contributing)
- [FAQ](#faq)

## Installation

### Option 1: Download Pre-built Binary (Recommended)

Download the latest release for your platform from the
[GitHub Releases](https://github.com/snyk/snyk-api-import/releases) page.

**macOS:**

```bash
# Download and install
curl -Lo snyk-api-import https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-darwin-amd64
chmod +x snyk-api-import
sudo mv snyk-api-import /usr/local/bin/
```

**Linux:**

```bash
# Download and install
curl -Lo snyk-api-import https://github.com/snyk/snyk-api-import/releases/latest/download/snyk-api-import-linux-amd64
chmod +x snyk-api-import
sudo mv snyk-api-import /usr/local/bin/
```

**Windows:**

Download the `.exe` file from the releases page and add it to your PATH.

### Option 2: Build from Source

Requires Go 1.23 or later:

```bash
git clone https://github.com/snyk/snyk-api-import.git
cd snyk-api-import-go
go build -o snyk-api-import
```

## Quick Start

### Option 1: Using config.toml (Recommended)

Create a `config.toml` file (see `config.toml.example` for full options):

```toml
[snyk]
token = "your-snyk-api-token"
group_id = "your-snyk-group-id"

[logging]
path = "./logs"

[integrations.github]
enabled = true
token = "your-github-token"
```

The tool will automatically find `config.toml` in:
- Current directory (`./config.toml`)
- Log directory (`$SNYK_LOG_PATH/config.toml`)
- User home (`~/.snyk-api-import/config.toml`)
- System-wide (`/etc/snyk-api-import/config.toml`)

Or specify a custom path:

```bash
snyk-api-import --config=/path/to/config.toml <command>
```

### Option 2: Using Environment Variables

```bash
export SNYK_TOKEN=your-snyk-api-token
export SNYK_LOG_PATH=./logs
export GITHUB_TOKEN=your-github-token
```

### Run your first import:

```bash
# Generate org data
snyk-api-import orgs:data --source=github --groupId=<your-group-id>

# Create orgs in Snyk
snyk-api-import orgs:create --file=group-<your-group-id>-github-orgs.json

# Generate import targets
snyk-api-import import:data --source=github --orgsData=snyk-created-orgs.json

# Run import
snyk-api-import import
```

## Configuration

### Configuration File (`config.toml`)

The recommended way to configure snyk-api-import is using a `config.toml` file. This provides a centralized, version-controllable configuration for all your integrations.

**Benefits:**

- ✅ Manage all integrations in one place
- ✅ No need to set environment variables
- ✅ Easy to switch between different configurations
- ✅ Support for default values (e.g., default Azure org, Bitbucket workspace)
- ✅ Auto-discovery in multiple locations

**Example configuration:**

```toml
[snyk]
token = "your-snyk-api-token"
group_id = "your-default-group-id"

[logging]
path = "./logs"
level = "info"

[integrations.github]
enabled = true
token = "your-github-token"

[integrations.bitbucket-cloud-app]
enabled = true
client_id = "your-client-id"
client_secret = "your-client-secret"
default_workspace = "my-workspace"

[integrations.azure-repos]
enabled = true
token = "your-azure-token"
default_org = "my-azure-org"
```

See [`config.toml.example`](config.toml.example) for a complete configuration template with all available options.

### Configuration Priority

When the same setting is defined in multiple places, the priority is:

1. **Command-line flags** (highest priority)
2. **Environment variables**
3. **config.toml file** (lowest priority)

This allows you to have a base configuration in `config.toml` and override specific values as needed.

### Environment Variables

All configuration can also be set via environment variables:

| Variable | Description |
|----------|-------------|
| `SNYK_TOKEN` | Snyk API token |
| `SNYK_GROUP_ID` | Default Snyk group ID |
| `SNYK_LOG_PATH` | Log directory path |
| `SNYK_LOG_LEVEL` | Log level (debug, info, warn, error) |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_APP_ID` | GitHub App ID (for `github-cloud-app`) |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (for `github-cloud-app`) |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App installation ID (optional, recommended for multiple installations) |
| `GITLAB_TOKEN` | GitLab Personal Access Token |
| `BITBUCKET_CLOUD_USERNAME` | Bitbucket Cloud username |
| `BITBUCKET_CLOUD_PASSWORD` | Bitbucket Cloud app password |
| `BITBUCKET_APP_CLIENT_ID` | Bitbucket Cloud App OAuth client ID |
| `BITBUCKET_APP_CLIENT_SECRET` | Bitbucket Cloud App OAuth client secret |
| `BITBUCKET_SERVER_TOKEN` | Bitbucket Server Personal Access Token |
| `BITBUCKET_SERVER_URL` | Bitbucket Server base URL |
| `AZURE_TOKEN` | Azure DevOps Personal Access Token |
| `AZURE_BASE_URL` | Azure DevOps base URL |
| `IMPORT_CONCURRENCY` | Max concurrent imports (default: 10) |

## Documentation

- [Getting Started Guide](docs/getting-started.md) - Complete walkthrough
  for all integrations
- [Authentication Guide](docs/authentication.md) - How to authenticate with
  each SCM
- [Command Reference](docs/command-reference.md) - Complete list of commands
  and flags
- [Advanced Workflows](docs/advanced-workflows.md) - Sync, re-import, and
  automation
- [CI/CD Examples](docs/examples/ci-cd-examples.md) - GitHub Actions, GitLab
  CI templates

### Integration-Specific Guides

- [GitHub & GitHub Enterprise](docs/mirror-github.md)
- [GitHub Cloud App](docs/github-cloud-app.md)
- [GitLab](docs/mirror-gitlab.md)
- [Bitbucket Cloud](docs/mirror-bitbucket-cloud.md)
- [Bitbucket Cloud App](docs/mirror-bitbucket-cloud-app.md)
- [Bitbucket Server](docs/mirror-bitbucket-server.md)

## Supported Integrations

| Source Control | Status | Auth Method |
|----------------|--------|-------------|
| GitHub.com | ✅ Stable | PAT |
| GitHub Enterprise Server | ✅ Stable | PAT |
| GitHub Cloud App | ✅ Stable | App Installation |
| GitLab.com | ✅ Stable | PAT |
| GitLab Self-Managed | ✅ Stable | PAT |
| Bitbucket Cloud | ✅ Stable | Username + App Password |
| Bitbucket Cloud App | ✅ Stable | OAuth2 Client Credentials |
| Bitbucket Server | ✅ Stable | PAT |
| Azure DevOps | ✅ Stable | PAT |

## Commands

| Command | Description |
|---------|-------------|
| `import` | Import repos/targets into Snyk organizations (default command) |
| `orgs:data` | Generate organization data from your SCM |
| `orgs:create` | Create Snyk organizations from generated data |
| `import:data` | Generate import targets file |
| `sync` | Sync existing Snyk projects with SCM changes |
| `list:imported` | List previously imported targets to skip re-imports |
| `help` | Show help and all available commands |

**View logs:** The tool generates JSON logs in `SNYK_LOG_PATH`. Use `jq` to
explore them:

```bash
# View successfully imported projects
jq . logs/your-org-id.imported-projects.log

# View failed imports with retry details
jq . logs/your-org-id.failed-imports.log

# View import job results
jq . logs/your-org-id.import-job-results.log
```

## Contributing

See [Contributing Guidelines](.github/CONTRIBUTING.md) for details on how to
contribute to this project.

## FAQ

<details>
<summary>What Go version is required?</summary>

Go 1.23 or later is required to build from source. Pre-built binaries have no
runtime dependencies.
</details>

<details>
<summary><code>Error: too many open files</code></summary>

If you see this error, you may need to increase the file descriptor limit
(`ulimit`). The tool performs concurrent operations and may exceed system
defaults.

**Quick Fix:**

```bash
ulimit -n 4096
```

**Or reduce concurrency:**

```bash
export IMPORT_CONCURRENCY=5
snyk-api-import import --concurrency=5
```

For permanent ulimit changes:

- **macOS**: Edit `/etc/sysctl.conf` or use `launchctl limit maxfiles`
- **Linux**: Edit `/etc/security/limits.conf`

Resources:

- [ss64.com ulimit reference](https://ss64.com/bash/ulimit.html)
- [macOS ulimit guide](http://blog.mact.me/2014/10/22/yosemite-upgrade-changes-open-file-limit)

</details>

<details>
<summary>
Self-signed certificate errors with GitHub Enterprise / GitLab
</summary>

If your SCM uses self-signed certificates, configure Go to trust them:

```bash
# Option 1: System certificate store (recommended)
# Add your CA cert to the system trust store

# Option 2: Disable TLS verification (not recommended for production)
export SNYK_DISABLE_TLS_VERIFY=true
```

Note: The tool uses Go's standard TLS library which respects system certificate
stores.
</details>

<details>
<summary>Does this work with Snyk Broker?</summary>

Yes. The tool uses Snyk's existing integrations, so if you have Broker
configured for your SCM integration in Snyk, imports will automatically use the
brokered connection.
</details>

<details>
<summary>What project types are supported for import?</summary>

The tool supports 100% of the same integration types and project sources as the
[Snyk Import API](https://docs.snyk.io/snyk-api/reference/import-projects-v1).
This includes:

- Open Source (package managers: npm, Maven, pip, etc.)
- Infrastructure as Code (Terraform, CloudFormation, Kubernetes, etc.)
- Container images (Dockerfile)
- Code analysis (via Snyk Code)

</details>

<details>
<summary>How is this different from the TypeScript version?</summary>

This Go implementation provides:

- **Better performance**: Compiled binary with efficient concurrency
- **Easier deployment**: Single binary with no runtime dependencies
- **Lower resource usage**: More efficient memory and CPU utilization
- **Same functionality**: Feature parity with the original TypeScript version

The original TypeScript version remains available at
<https://github.com/snyk/snyk-api-import>
</details>

## License

[License information to be added]
