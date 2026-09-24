// snyk-request-manager errors (ApiError, NotFoundError, etc.) store the raw
// Axios error on `.message` instead of a string. The Axios error carries the
// request config and the serialized HTTP request, including the
// `Authorization: token <SNYK_TOKEN>` header, so it must never be passed to
// util.inspect, JSON.stringify or a logger. These helpers pull out only safe,
// human-readable fields.

export function getErrorMessage(error: any): string {
  if (error === undefined || error === null) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  const message = error.message;
  if (typeof message === 'string' && message) {
    return message;
  }
  if (message && typeof message === 'object') {
    const nested = message.message;
    if (typeof nested === 'string' && nested) {
      return nested;
    }
  }
  return typeof error.name === 'string' && error.name
    ? error.name
    : 'Unknown error';
}

// Returns the HTTP response for an error, whether it is a plain Axios error
// (`error.response`) or a snyk-request-manager error wrapping one
// (`error.message.response`).
export function getErrorResponse(error: any):
  | {
      status?: number;
      statusCode?: number;
      headers?: Record<string, any>;
      data?: any;
    }
  | undefined {
  const res = error?.response ?? error?.message?.response;
  return res && typeof res === 'object' ? res : undefined;
}
