# GitHub Cloud App Integration

This document provides detailed information about using GitHub Cloud App authentication with the snyk-api-import tool.

## Overview

GitHub Cloud App integration provides enhanced security and functionality compared to traditional Personal Access Token authentication. It uses GitHub's official App authentication mechanism with JWT tokens and installation tokens.

## Key Differences from Personal Access Token

| Feature         | Personal Access Token       | GitHub Cloud App                    |
| --------------- | --------------------------- | ----------------------------------- |
| Authentication  | User token                  | App JWT + Installation token        |
| Rate Limits     | 5000 requests/hour per user | 5000 requests/hour per installation |
| Access Control  | User-based                  | App-based with granular permissions |
| RBAC            | User account level          | Application level                   |
| Token Lifecycle | Manual rotation             | Automatic rotation (1 hour)         |
| Security        | User credentials            | App-specific credentials            |

## Prerequisites

- GitHub organization with admin access
- Node.js 20+ (as specified in the project requirements)
- Understanding of GitHub App concepts

## Setup Guide

### Step 1: Create a GitHub App

1. Navigate to your GitHub organization settings
2. Go to "Developer settings" → "GitHub Apps"
3. Click "New GitHub App"
4. Fill in the required information:

   **Basic Information:**

   - App name: `Snyk Import Tool` (or your preferred name)
   - Homepage URL: Your organization's website
   - App description: `Integration for importing repositories into Snyk`

   **Permissions:**

   **Repository permissions:**

   - Contents: `Read` (required to access repository files)
   - Metadata: `Read` (required to access repository metadata)
   - Pull requests: `Read` (optional, for future enhancements)
   - Issues: `Read` (optional, for future enhancements)

   **Organization permissions:**

   - Members: `Read` (required to list organization members)

   **Subscribe to events:** Leave empty (not required for this integration)

5. Click "Create GitHub App"

### Step 2: Install the GitHub App

1. After creating the app, you'll be redirected to the app page
2. Click "Install App"
3. Select the organization(s) where you want to install the app
4. Choose repository access:
   - **All repositories**: Recommended for full import capability
   - **Selected repositories**: Choose specific repositories if needed
5. Click "Install"

### Step 3: Get App Credentials

1. From the app page, note the **App ID** (numeric value)
2. Scroll down to "Private keys" section
3. Click "Generate a private key"
4. Download the private key file (PEM format)
5. Save the private key content securely

### Step 4: Configure Environment Variables

Set the following environment variables in your shell or CI/CD environment:

```bash
# Required: Your GitHub App ID
export GITHUB_APP_ID="123456"

# Required: Your GitHub App private key (PEM format)
export GITHUB_APP_PRIVATE_KEY="$(cat ${SNYK_LOG_PATH}/your-private-key.pem)"

```bash
# Required: Target specific installation this is found on the GitHub App installation page under the apps configuration in in the end of the url(if you have multiple)
export GITHUB_APP_INSTALLATION_ID="789012"
```

## Usage Examples

### Generate Organization Data

```bash
snyk-api-import orgs:data \
  --source=github-cloud-app \
  --groupId=your-snyk-group-id \
  --skipEmptyOrgs
```

### Generate Import Targets

```bash
snyk-api-import import:data \
  --source=github-cloud-app \
  --orgsData=group-your-snyk-group-id-github-cloud-app-orgs.json
```

### Sync Projects

```bash
snyk-api-import sync \
  --source=github-cloud-app \
  --orgPublicId=your-snyk-org-id \
  --dryRun
```

## Security Best Practices

### Private Key Management

- **Never commit private keys to version control**
- Store private keys in secure secret management systems
- Use environment variables or secure configuration files
- Rotate private keys regularly (GitHub allows regenerating them)

### Environment Variables

```bash
# Good: Use environment variables
export GITHUB_APP_PRIVATE_KEY="$(cat /secure/path/to/private-key.pem)"

# Bad: Hardcode in scripts
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
```

### CI/CD Integration

For CI/CD environments, use your platform's secret management:

**GitHub Actions:**

```yaml
env:
  GITHUB_APP_ID: ${{ secrets.GITHUB_APP_ID }}
  GITHUB_APP_PRIVATE_KEY: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
```

**GitLab CI:**

```yaml
variables:
  GITHUB_APP_ID: $GITHUB_APP_ID
  GITHUB_APP_PRIVATE_KEY: $GITHUB_APP_PRIVATE_KEY
```

## Troubleshooting

### Common Error Messages

#### "GITHUB_APP_ID environment variable is required"

- **Cause**: The `GITHUB_APP_ID` environment variable is not set
- **Solution**: Set the environment variable with your GitHub App's numeric ID

#### "GITHUB_APP_PRIVATE_KEY must be in PEM format"

- **Cause**: The private key is not in proper PEM format
- **Solution**: Ensure the private key includes the full PEM headers:
  ```
  -----BEGIN RSA PRIVATE KEY-----
  [key content]
  -----END RSA PRIVATE KEY-----
  ```

#### "Failed to authenticate with GitHub App"

- **Cause**: Authentication failed with GitHub
- **Solutions**:
  - Verify the app is installed on the target organization
  - Check that the private key matches the app
  - Ensure the app has the required permissions
  - Verify the app ID is correct

#### "No organizations found"

- **Cause**: No accessible organizations found
- **Solutions**:
  - Verify the app is installed on organizations (not just users)
  - Check that the app has access to the repositories you want to import
  - Ensure the app is installed on the correct organization

#### "Failed to list repositories for organization"

- **Cause**: Cannot access repositories in the organization
- **Solutions**:
  - Verify the app has "Contents: Read" permission
  - Check that the app is installed with access to the repositories
  - Ensure the organization allows the app to access its repositories

### Debug Mode

Enable debug logging for detailed error information:

```bash
DEBUG=snyk* snyk-api-import orgs:data --source=github-cloud-app --groupId=your-group-id
```

### Verification Steps

1. **Test App Installation**:

   ```bash
   # This should list your installed organizations
   snyk-api-import orgs:data --source=github-cloud-app --groupId=test
   ```

2. **Test Repository Access**:
   ```bash
   # This should list repositories in your organizations
   snyk-api-import import:data --source=github-cloud-app --orgsData=test-orgs.json
   ```

## Migration from Personal Access Token

If you're currently using Personal Access Token authentication, you can migrate to GitHub Cloud App:

1. **Set up GitHub Cloud App** (follow the setup guide above)
2. **Test the new integration** with a small subset of repositories
3. **Update your automation** to use the new environment variables
4. **Gradually migrate** your import processes
5. **Remove Personal Access Token** once migration is complete

## Rate Limits

GitHub Cloud App provides:

- **5000 requests per hour per installation**
- **Automatic token rotation** every hour
- **Better rate limit handling** compared to user tokens

Monitor your usage and adjust concurrency settings if needed:

```bash
# Lower concurrency for large imports
snyk-api-import import --concurrency=5
```

## Support

For issues specific to GitHub Cloud App integration:

1. Check the troubleshooting section above
2. Enable debug logging for detailed error information
3. Verify your GitHub App configuration and permissions
4. Check GitHub's API status and rate limits

For general snyk-api-import issues, refer to the main documentation and FAQ.
