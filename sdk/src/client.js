import { ConnectionError, errorFromResponse } from './errors.js';

const DEFAULT_BASE_URL = 'https://inboxly-ybh3.onrender.com';
const API_PREFIX = '/api/v1/public';

// Methods that are safe to repeat when the server errored or the connection
// dropped mid-request. A POST may already have sent a message, so it is only
// retried when the server says it refused it outright (429).
const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  constructor({ apiKey, baseUrl, timeoutMs = 60_000, maxRetries = 2, fetch: fetchImpl } = {}) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new TypeError('An Inboxly API key is required: new Inboxly({ apiKey: "..." })');
    }
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.fetch = fetchImpl || globalThis.fetch;
    if (typeof this.fetch !== 'function') {
      throw new TypeError('No fetch implementation found. Use Node 20.3+ or pass { fetch }.');
    }
  }

  url(path, query) {
    const url = new URL(`${this.baseUrl}${API_PREFIX}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request(method, path, { query, body, form, signal } = {}) {
    const headers = { 'x-api-key': this.apiKey, accept: 'application/json' };
    let payload;
    if (form) {
      payload = form; // fetch sets the multipart boundary itself
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const url = this.url(path, query);
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      let res;
      try {
        res = await this.fetch(url, {
          method,
          headers,
          body: payload,
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        if (attempt < this.maxRetries && IDEMPOTENT.has(method)) {
          await sleep(backoff(attempt));
          continue;
        }
        const reason = err?.name === 'TimeoutError' ? `timed out after ${this.timeoutMs}ms` : err?.message;
        throw new ConnectionError(`Could not reach Inboxly at ${this.baseUrl}: ${reason}`, { cause: err });
      }

      if (res.ok) return readBody(res);

      const retryAfter = Number(res.headers.get('retry-after')) || null;
      const retryable = res.status === 429 || (res.status >= 500 && IDEMPOTENT.has(method));
      if (retryable && attempt < this.maxRetries) {
        await res.body?.cancel();
        await sleep(retryAfter ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      throw errorFromResponse(res.status, await readBody(res), retryAfter);
    }
  }

  get(path, query, opts) { return this.request('GET', path, { ...opts, query }); }
  post(path, body, opts) { return this.request('POST', path, { ...opts, body }); }
  put(path, body, opts) { return this.request('PUT', path, { ...opts, body }); }
  patch(path, body, opts) { return this.request('PATCH', path, { ...opts, body }); }
  delete(path, opts) { return this.request('DELETE', path, opts); }
  upload(path, form, opts) { return this.request('POST', path, { ...opts, form }); }
}

function backoff(attempt) {
  return Math.min(500 * 2 ** attempt, 8_000) + Math.floor(Math.random() * 250);
}

// JSON for API responses, text for CSV exports, a Buffer for media.
async function readBody(res) {
  if (res.status === 204) return undefined;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  }
  if (type.startsWith('text/')) return res.text();
  return Buffer.from(await res.arrayBuffer());
}

export function encodeId(id) {
  if (id === undefined || id === null || id === '') throw new TypeError('An id is required');
  return encodeURIComponent(String(id));
}
