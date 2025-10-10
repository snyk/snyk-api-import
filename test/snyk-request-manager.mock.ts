import { Observable } from 'rxjs';

export class requestsManager {
  opts: any;
  lastRequest: any;
  constructor(opts?: any) {
    this.opts = opts || {};
    this.lastRequest = null;
  }

  async request({ verb = 'get', url, body, useRESTApi = false }: any) {
    this.lastRequest = { verb, url, body, useRESTApi };
    // Log requests in tests to help debugging
    // eslint-disable-next-line no-console
    console.log(`[mock.request] ${verb.toUpperCase()} ${url}`);

    // Targets/projects endpoints return { data: { values: [...] } } or similar
    if (url && url.includes('/targets')) {
      return { data: { values: [] }, statusCode: 200 };
    }
    if (url && url.includes('/projects')) {
      return { data: { values: [] }, statusCode: 200 };
    }

    // Integrations listing: return an empty map
    if (url && url.includes('/integrations') && verb.toLowerCase() === 'get') {
      return { data: {}, statusCode: 200 };
    }

    // Import endpoint: POST to the integrations import should return 201 with a
    // Location header so importTarget can poll the returned URL.
    if (verb && verb.toLowerCase() === 'post' && url && url.includes('/integrations') && url.includes('/import')) {
      // console log to help debug tests
      // eslint-disable-next-line no-console
      console.log(`[mock] returning import location for ${url}`);
      return {
        statusCode: 201,
        data: {},
        headers: { location: 'http://example.test/imports/1' },
      };
    }

    // Group orgs listing: /group/:groupId/orgs
    if (url && /\/group\/([^/]+)\/orgs/.test(url)) {
      const m = url.match(/\/group\/([^/]+)\/orgs/);
      const groupId = (m && m[1]) || 'group-id';
      // Return no existing orgs by default so createOrgs will attempt creation.
      return {
        statusCode: 200,
        data: { name: `group-${groupId}`, url: `https://snyk.example/groups/${groupId}`, id: groupId, orgs: [] },
      };
    }

    // Create org endpoint
    if (verb && verb.toLowerCase() === 'post' && url && url.includes('/org')) {
      let parsed: any = {};
      try {
        parsed = typeof body === 'string' ? JSON.parse(body) : body || {};
      } catch (e) {
        parsed = {};
      }
      const id = `org-${Date.now()}`;
      return { statusCode: 201, data: { id, name: parsed.name || 'created-org', created: new Date().toISOString() } };
    }

    const res = { data: {}, statusCode: 200 };
    // (no-op)
    return res;
  }

  requestStream() {
    return new Observable((subscriber) => {
      subscriber.next({ body: { values: [] }, statusCode: 200 });
      subscriber.complete();
    });
  }
}

export default { requestsManager };
