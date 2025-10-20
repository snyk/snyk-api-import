// Minimal, well-formed mock of snyk-request-manager used by unit tests

class RequestsManagerMock {
  constructor(params = {}) {
    this._fixtures = params.fixtures || {};
    this._requests = [];
    this._importJobs = {};
    this._nextImportId = 1;
    this._userAgentPrefix = params.userAgentPrefix || '';
  }

  _matchFixture(url) {
    if (!url) return undefined;
    if (this._fixtures[url]) return this._fixtures[url];
    const pathOnly = url.split('?')[0];
    if (this._fixtures[pathOnly]) return this._fixtures[pathOnly];
    return undefined;
  }

  async request(req = {}) {
    this._requests.push(req);
    const url = String(req.url || req.path || '');
    const verb = (req.verb || (req.method && req.method.toLowerCase()) || 'get').toLowerCase();

    const fx = this._matchFixture(url);
    if (fx) return fx;

    if (url.includes('/integrations')) {
      return { statusCode: 200, data: { github: 'github-integration-id' } };
    }

    // REST projects page shape used by listProjects
    if (url.includes('/projects')) {
  const orgIdMatch = url.match(/\/orgs\/([^/?]+)/);
      const orgId = (orgIdMatch && orgIdMatch[1]) || req.orgId || process.env.TEST_ORG_ID || '123456789';
      return {
        statusCode: 200,
        data: {
          jsonapi: { version: '1.0' },
          data: [
            {
              id: 'proj-1',
              type: 'project',
              attributes: { targetReference: 'master', origin: 'github', name: 'mock-project' },
              relationships: {
                org: { data: { id: orgId, type: 'org' } },
              },
            },
          ],
          links: { next: undefined },
        },
      };
    }

    // Targets listing used by listTargets/getSnykTarget
    if (url.includes('/targets')) {
  const orgIdMatch = url.match(/\/orgs\/([^/?]+)/);
      const orgId = (orgIdMatch && orgIdMatch[1]) || req.orgId || process.env.TEST_ORG_ID || '123456789';
      return {
        statusCode: 200,
        data: {
          data: [
            {
              id: orgId,
              type: 'target',
              attributes: { displayName: 'mock-repo', isPrivate: false, origin: 'github' },
              relationships: { org: { data: { id: orgId, type: 'org' } } },
            },
          ],
          links: { next: undefined },
        },
      };
    }

    if (url.includes('/import') || url.includes('/imports')) {
      if (verb === 'post') {
        const id = String(this._nextImportId++);
        const location = `/import/${id}`;
        this._importJobs[id] = { id, status: 'complete', logs: [] };
        return { statusCode: 201, headers: { location } };
      }
      if (verb === 'get') {
        const m = /\/import\/(\d+)/.exec(url) || /\/imports\/(\d+)/.exec(url);
        const id = m ? m[1] : null;
        if (id && this._importJobs[id]) return { statusCode: 200, data: this._importJobs[id] };
        return { statusCode: 200, data: { status: 'pending' } };
      }
    }

    if (url.includes('/orgs') && url.match(/\/group\//)) {
      // group -> list orgs endpoint expected shape by src/lib/api/group
      return {
        statusCode: 200,
        data: {
          id: req.groupId || 'test-group-1',
          name: 'mock-group',
          url: '/group/test-group-1',
          orgs: [
            { id: req.orgId || '74e2f385-a54f-491e-9034-76c53e72927a', name: 'mock-org' },
          ],
        },
      };
    }
    if (url.includes('/orgs')) {
      // generic orgs/projects/targets endpoints
      return { statusCode: 200, data: { data: [{ type: 'org', id: req.orgId || '123456789', attributes: { name: 'mock-org' } }], links: {} } };
    }

    return { statusCode: 200, data: {} };
  }

  async requestBulk(arr = []) {
    const results = arr.map((r) => {
      const url = (r && (r.url || r.path)) || '';
      const fx = this._matchFixture(url);
      if (fx) return fx;
      return { statusCode: 200, data: {} };
    });
    return results;
  }

  requestStream() {
    return 'mock-request-id';
  }

  on() {
    // no-op
  }
}

function getConfig() {
  return { endpoint: process.env.SNYK_API || 'https://api.snyk.io', token: process.env.SNYK_TOKEN || '' };
}

module.exports = {
  requestsManager: RequestsManagerMock,
  getConfig,
};
