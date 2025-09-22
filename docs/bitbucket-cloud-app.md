# Bitbucket Cloud App Integration

The snyk-api-import tool supports Bitbucket Cloud App authentication, enabling secure, scalable imports for Bitbucket Cloud workspaces and repositories.

## Key Benefits
- **OAuth2 App Authentication**: Uses Bitbucket Cloud OAuth2 client credentials for secure API access
- **Higher Rate Limits**: App-based authentication avoids user-level rate limits
- **Granular Permissions**: App access is scoped to workspaces and repositories you authorize
- **No Personal Tokens**: Credentials are managed at the app level, not per user

## Setup Requirements
### 1. Create a Bitbucket Cloud OAuth App
1. Go to Bitbucket Cloud > Personal settings > OAuth > Add consumer
2. Set a name (e.g., "Snyk Import Tool")
3. Set callback URL (not required for import)
4. Grant permissions:
   - Workspace: Read
   - Repositories: Read
   - Projects: Read
5. Save and note the **Key** (Client ID) and **Secret**

### 2. Configure Environment Variables
Set the following environment variables:
```bash
export BITBUCKET_APP_CLIENT_ID="your-client-id"
export BITBUCKET_APP_CLIENT_SECRET="your-client-secret"
```

### 3. Usage
Use `bitbucket-cloud-app` as the source type in your commands:
```bash
# 1. Generate workspace data
snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=your-group-id

# 2. Create organizations in Snyk
snyk-api-import orgs:create --file=group-your-group-id-bitbucket-cloud-app-orgs.json

# 3. Set up Bitbucket Cloud App integration in each Snyk organization
# IMPORTANT: You must manually configure the Bitbucket Cloud App integration in each
# organization through the Snyk UI or API before proceeding to step 4.
# Go to each organization in Snyk and add the Bitbucket Cloud App integration.

# 4. Generate import targets
snyk-api-import import:data --source=bitbucket-cloud-app --orgsData=orgs-data.json

# 5. Sync projects
snyk-api-import sync --source=bitbucket-cloud-app --orgPublicId=your-org-id
```

## Security Considerations
- **Client Secret Storage**: Store the client secret securely and never commit it to version control
- **Minimal Permissions**: The app only requests read permissions for workspace and repo metadata
- **Workspace Scope**: Access is limited to workspaces where the app is authorized

## Troubleshooting
### Common Issues
1. **"BITBUCKET_APP_CLIENT_ID environment variable is required"**
   - Ensure `BITBUCKET_APP_CLIENT_ID` is set to your OAuth app's client ID
2. **"BITBUCKET_APP_CLIENT_SECRET environment variable is required"**
   - Ensure `BITBUCKET_APP_CLIENT_SECRET` is set to your OAuth app's client secret
3. **"Failed to authenticate with Bitbucket Cloud App"**
   - Verify the app credentials are correct
   - Check that the app has the required permissions
4. **"No workspaces found"**
   - Verify the app is authorized for the target workspaces
   - Check that the app has access to the repositories you want to import
5. **"Missing integrationId in import targets"**
   - Ensure you have set up the Bitbucket Cloud App integration in each Snyk organization
   - The integration must be configured through the Snyk UI before running `import:data`
   - Check that the integration appears in the organization's integrations list

### Debug Mode
Run with debug logging to get more detailed error information:
```bash
DEBUG=snyk* snyk-api-import orgs:data --source=bitbucket-cloud-app --groupId=your-group-id
```
