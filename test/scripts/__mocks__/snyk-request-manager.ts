// Removed unused eslint-disable-next-line directive
export class requestsManager {
  params: unknown;
  constructor(params: unknown = {}) {
    this.params = params;
  }

  request = (request: { verb: string; url?: string; body?: any } = { verb: 'get' }): Promise<unknown> => {
    return new Promise((resolve) => {
      const verb = request.verb || 'get';
      if (verb === 'get') {
        // If running the 'unique-org' fixture tests, return an existing org
        // so the create flow treats the organization as already present.
        const logPath = process.env.SNYK_LOG_PATH || '';
        if (logPath.includes('unique-org')) {
          const orgName = process.env.TEST_ORG_NAME || 'snyk-api-import-hello';
          const org = { name: orgName, id: `org-existing-${Date.now()}`, url: `https://snyk.example/orgs/existing` };
          return resolve({ statusCode: 200, data: { name: 'group-test', url: 'https://snyk.example/groups/test', id: 'test-group', orgs: [org] } });
        }
    // Default: no existing orgs
      return resolve({ statusCode: 200, data: { name: 'group-test', url: 'https://snyk.example/groups/test', id: 'test-group', orgs: [] } });
      }
      if (verb === 'post') {
            // If creating an org (POST /orgs or POST /org), return a CreatedOrgResponse-like payload
            if (request.url && (request.url.includes('/orgs') || request.url.includes('/org'))) {
          // Simulate token failure when SNYK_TOKEN is 'bad-token'
          if (process.env.SNYK_TOKEN === 'bad-token') {
            return resolve({ statusCode: 401, error: { message: 'Invalid token' } });
          }
          let parsed = {} as any;
          try {
            parsed = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
          } catch (e) {
            parsed = {} as any;
          }
          const id = `org-${Date.now()}`;
          return resolve({ statusCode: 201, data: { id, name: parsed.name || 'created-org', created: new Date().toISOString() } });
        }
        // default POST behavior (e.g., imports)
        return resolve({
          statusCode: 201,
          headers: {
            location:
              'https://api.snyk.io/v1/org/ORG-ID/integrations/INTEGRATION-ID/import/IMPORT-ID',
          },
        });
      }
      return resolve({ statusCode: 200, data: {} });
    });
  };
}
