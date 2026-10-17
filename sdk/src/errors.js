// Every failed call rejects with an InboxlyError (or one of its subclasses), so
// callers can branch on `err.status` / `instanceof` instead of parsing strings.

export class InboxlyError extends Error {
  constructor(message, { status = null, code = null, details = null, body = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'InboxlyError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }
}

// 400: the request body failed validation. `details` maps field -> messages.
export class ValidationError extends InboxlyError {
  constructor(message, opts) { super(message, opts); this.name = 'ValidationError'; }
}

// 401: missing, wrong or revoked API key.
export class AuthenticationError extends InboxlyError {
  constructor(message, opts) { super(message, opts); this.name = 'AuthenticationError'; }
}

// 403: the key lacks the scope this call needs, or the workspace is suspended
// or its subscription is inactive.
export class PermissionError extends InboxlyError {
  constructor(message, opts) { super(message, opts); this.name = 'PermissionError'; }
}

export class NotFoundError extends InboxlyError {
  constructor(message, opts) { super(message, opts); this.name = 'NotFoundError'; }
}

// 429: still rate limited after the client's own retries ran out.
export class RateLimitError extends InboxlyError {
  constructor(message, opts = {}) {
    super(message, opts);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

// The request never got an HTTP response: DNS, refused connection, timeout.
export class ConnectionError extends InboxlyError {
  constructor(message, opts) { super(message, opts); this.name = 'ConnectionError'; }
}

export function errorFromResponse(status, body, retryAfterSeconds) {
  const message = (body && typeof body === 'object' && (body.error || body.message))
    || (typeof body === 'string' && body.trim())
    || `Request failed with status ${status}`;
  const opts = {
    status,
    code: body?.code ?? null,
    details: body?.details ?? null,
    body,
  };
  if (status === 400 || status === 422) return new ValidationError(message, opts);
  if (status === 401) return new AuthenticationError(message, opts);
  if (status === 403) return new PermissionError(message, opts);
  if (status === 404) return new NotFoundError(message, opts);
  if (status === 429) {
    return new RateLimitError(message, { ...opts, retryAfterSeconds: body?.retryAfterSeconds ?? retryAfterSeconds });
  }
  return new InboxlyError(message, opts);
}
