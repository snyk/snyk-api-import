# Copilot Instructions for snyk-api-import

## Project Overview
- **Purpose:** Automates importing projects into Snyk using the Snyk API, supporting GitHub, GitLab, Bitbucket, and Azure sources. Handles rate limiting, queuing, retries, and logging for robust, large-scale imports.
- **Architecture:**
  - **Commands:** Entry points in `src/cmds/` (e.g., `import`, `orgs:create`, `sync`). Each command is a CLI utility for a specific workflow.
  - **Source Handlers:** SCM-specific logic in `src/lib/source-handlers/` (e.g., `github-cloud-app/`, `bitbucket-cloud/`). Each handler manages API calls, authentication, and data extraction for its source type.
  - **Logging:** All operations log to Bunyan-compatible logs, with loggers in `src/loggers/`.
  - **Utilities:** Shared helpers in `src/lib/` (e.g., rate limiting, API token management, file operations).
  - **Scripts:** Automation and data generation scripts in `src/scripts/`.


## Key Workflows
- **Import Projects:**
  - Use `snyk-api-import import` to start an import based on a config file (see `docs/import.md`).
  - For GitHub Cloud App, follow the setup in the README and use `--source=github-cloud-app`.
  - For Bitbucket Cloud App, follow the setup in the README and use `--source=bitbucket-cloud-app`.
- **Create Orgs:**
  - Generate org/workspace data: `snyk-api-import orgs:data --source=<source> --groupId=<group>`
  - Create orgs: `snyk-api-import orgs:create --file=<orgs-data.json>`
- **Sync Projects:**
  - Detect and update changes: `snyk-api-import sync --source=<source> --orgPublicId=<org>`

## Bitbucket Cloud App Setup
- Create a Bitbucket Cloud OAuth App and grant Workspace/Repo/Project read permissions
- Set environment variables:
  - `BITBUCKET_APP_CLIENT_ID` (OAuth client ID)
  - `BITBUCKET_APP_CLIENT_SECRET` (OAuth client secret)
- Use `bitbucket-cloud-app` as the source type in CLI commands
- Manually configure Bitbucket Cloud App integration in each Snyk org before importing

## Troubleshooting Bitbucket Cloud App
- Ensure required env vars are set
- Verify app permissions and workspace access
- Check integrationId is present in import targets
- Use debug logging: `DEBUG=snyk* snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=<group>`

## Developer Conventions
- **TypeScript:** Strict mode enforced. All code in `src/` is TypeScript, compiled to `dist/`.
- **Testing:** Unit tests in `test/` (mirrors `src/` structure). Run with `npm test` (see `jest.config.js`).
- **Linting/Formatting:**
  - Lint: `npm run lint`
  - Format: `npm run format`
- **Node Version:** Use Node.js v20 (see `.nvmrc`).
- **Build:** Compile with `npm run build`.
- **Logs:** Use Bunyan CLI to inspect logs (see README for details).

## Patterns & Integration Points
- **Rate Limiting:** Managed via Bottleneck in `src/lib/limiters.ts` and `src/lib/request-with-rate-limit.ts`.
- **API Tokens:** Managed in `src/lib/get-api-token.ts`.
- **SCM Integration:** Each source handler encapsulates authentication and API logic. For GitHub Cloud App, see `src/lib/source-handlers/github-cloud-app/`.
- **Config Files:** Import configuration is documented in `docs/import.md`.
- **Environment Variables:** Required for SCM integrations (see README for examples).

## Examples
- To add a new SCM source, create a new handler in `src/lib/source-handlers/` and update relevant commands in `src/cmds/`.
- To debug imports, enable debug logging: `DEBUG=snyk* snyk-api-import import ...`

## References
- [README.md](../README.md) — Setup, workflows, troubleshooting
- [docs/import.md](../docs/import.md) — Import config file format and details
- [src/cmds/](../src/cmds/) — CLI entry points
- [src/lib/source-handlers/](../src/lib/source-handlers/) — SCM integrations
- [test/](../test/) — Unit tests

---
If any section is unclear or missing, please provide feedback to improve these instructions.