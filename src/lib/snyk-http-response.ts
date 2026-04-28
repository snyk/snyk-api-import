/**
 * Response shape from snyk-request-manager.request() (axios-backed).
 * The package resolves this as unknown; we narrow it for strict TypeScript.
 */
export interface SnykHttpResponse<T = unknown> {
  data: T;
  body?: T;
  status?: number;
  statusCode?: number;
}
