import { jest } from '@jest/globals';
import * as urlLib from 'url';
// nock may be loaded in tests; import lazily to check for active interceptors
let nockLib: any;
try {
  nockLib = require('nock');
} catch {
  nockLib = null;
}

// Primary jest mock function. Tests can call needle.mockResolvedValueOnce to
// control the response for a specific invocation. When not mocked explicitly
// we attempt to perform a lightweight HTTP GET/POST which will be intercepted
// by nock in tests that use it; otherwise we fall back to a default shape.
export const needle = jest.fn(
  async (method: string, url: string, body?: any, opts?: any) => {
    // If a test has queued a manual mockResolvedValueOnce, jest will return that
    // before calling the implementation. The fallback implementation tries to use
    // Node's http request — nock can intercept this — and if that fails we return
    // a default success response.
    try {
      const parsed = urlLib.parse(url as string);
      const isHttp =
        parsed.protocol === 'http:' || parsed.protocol === 'https:';
      // If nock is in use and has an active interceptor for this URL, let nock
      // handle the request via a lightweight http request (nock intercepts)
      if (nockLib && typeof nockLib.isActive === 'function' && isHttp) {
        // If there are pending mocks for the hostname/path, prefer making the
        // real request which nock will intercept. Otherwise, avoid making
        // network calls and fall back to a default response.
        try {
          const hostname = parsed.hostname;
          const pending = nockLib.pendingMocks && nockLib.pendingMocks();
          if (pending && pending.length > 0) {
            // perform an actual http request that nock can intercept
            return await new Promise<any>((resolve) => {
              const req = (
                parsed.protocol === 'https:'
                  ? require('https')
                  : require('http')
              ).request(
                url as string,
                { method: method.toUpperCase() },
                (res: any) => {
                  const chunks: any[] = [];
                  res.on('data', (c: any) => chunks.push(c));
                  res.on('end', () => {
                    const bodyStr = Buffer.concat(chunks).toString('utf8');
                    let parsedBody: any = bodyStr;
                    try {
                      parsedBody = JSON.parse(bodyStr);
                    } catch {
                      // leave as string if not JSON
                    }
                    resolve({ statusCode: res.statusCode, body: parsedBody });
                  });
                },
              );
              req.on('error', () => {
                resolve({ statusCode: 200, body: {} });
              });
              if (body) {
                try {
                  req.write(
                    typeof body === 'string' ? body : JSON.stringify(body),
                  );
                } catch {
                  // ignore
                }
              }
              req.end();
            });
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore and fall through
    }

    // Default fallback response shape (used when scheme is not http/https)
    return { statusCode: 200, body: {} };
  },
);

export default needle;

// Ensure CommonJS consumers (require('needle')) get the mock function directly
// so tests that do `jest.mock('needle'); const needle = require('needle')` work.
(module as any).exports = needle;
