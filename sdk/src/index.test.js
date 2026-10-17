import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Inboxly, {
  ValidationError, AuthenticationError, RateLimitError, ConnectionError, InboxlyError,
} from './index.js';

// A fake fetch that records each call and answers from a queue of responses.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: new URL(url), ...init });
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  fn.calls = calls;
  return fn;
}

const json = (status, body, headers = {}) => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json', ...headers } },
);

const client = (fetch, extra) => new Inboxly({
  apiKey: 'ik_test', baseUrl: 'https://api.example.com/', fetch, maxRetries: 2, ...extra,
});

test('requires an API key', () => {
  const saved = process.env.INBOXLY_API_KEY;
  delete process.env.INBOXLY_API_KEY;
  try {
    assert.throws(() => new Inboxly({ fetch: () => {} }), /API key is required/);
  } finally {
    if (saved !== undefined) process.env.INBOXLY_API_KEY = saved;
  }
});

test('sends the key header to the public API prefix', async () => {
  const fetch = fakeFetch(json(200, { workspace: { id: 'w1' } }));
  const out = await client(fetch).me();
  assert.deepEqual(out, { workspace: { id: 'w1' } });
  const [call] = fetch.calls;
  assert.equal(call.method, 'GET');
  assert.equal(call.url.href, 'https://api.example.com/api/v1/public/me');
  assert.equal(call.headers['x-api-key'], 'ik_test');
});

test('sendText posts the text message body', async () => {
  const fetch = fakeFetch(json(200, { messageId: 'm1' }));
  await client(fetch).messages.sendText('+919999999999', 'hello', { waNumberId: 'n1' });
  const [call] = fetch.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url.pathname, '/api/v1/public/messages');
  assert.equal(call.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(call.body), { type: 'text', to: '+919999999999', body: 'hello', waNumberId: 'n1' });
});

test('query params skip empty values and ids are encoded', async () => {
  const fetch = fakeFetch(json(200, []), json(200, {}));
  const inboxly = client(fetch);
  await inboxly.contacts.list({ page: 2, search: 'a b', tag: undefined, limit: null });
  await inboxly.campaigns.get('x/y');
  assert.equal(fetch.calls[0].url.search, '?page=2&search=a+b');
  assert.equal(fetch.calls[1].url.pathname, '/api/v1/public/campaigns/x%2Fy');
});

test('maps error statuses to typed errors with the server message', async () => {
  const fetch = fakeFetch(json(400, { error: 'body is required', details: { body: ['Required'] } }));
  const err = await client(fetch, { maxRetries: 0 }).messages.send({ type: 'text', to: '1' }).catch((e) => e);
  assert.ok(err instanceof ValidationError);
  assert.ok(err instanceof InboxlyError);
  assert.equal(err.status, 400);
  assert.equal(err.message, 'body is required');
  assert.deepEqual(err.details, { body: ['Required'] });

  const bad = fakeFetch(json(401, { error: 'Missing x-api-key header' }));
  await assert.rejects(client(bad).me(), AuthenticationError);
});

test('retries a 429 honouring Retry-After, then succeeds', async () => {
  const fetch = fakeFetch(
    json(429, { error: 'Too many', retryAfterSeconds: 0 }, { 'retry-after': '0' }),
    json(200, { ok: true }),
  );
  assert.deepEqual(await client(fetch).messages.sendText('1', 'hi'), { ok: true });
  assert.equal(fetch.calls.length, 2);
});

test('gives up with RateLimitError once retries run out', async () => {
  const fetch = fakeFetch(() => json(429, { error: 'Too many', retryAfterSeconds: 0 }, { 'retry-after': '0' }));
  const err = await client(fetch, { maxRetries: 1 }).wallet.balance().catch((e) => e);
  assert.ok(err instanceof RateLimitError);
  assert.equal(fetch.calls.length, 2);
});

test('retries a 5xx on GET but never on POST', async () => {
  const get = fakeFetch(json(503, { error: 'down' }), json(200, { ok: 1 }));
  assert.deepEqual(await client(get).wallet.balance(), { ok: 1 });
  assert.equal(get.calls.length, 2);

  const post = fakeFetch(json(503, { error: 'down' }), json(200, { ok: 1 }));
  await assert.rejects(client(post).messages.sendText('1', 'hi'), (e) => e.status === 503);
  assert.equal(post.calls.length, 1);
});

test('network failure becomes ConnectionError (no retry for POST)', async () => {
  const fetch = fakeFetch(new TypeError('fetch failed'));
  await assert.rejects(client(fetch).campaigns.launch('c1'), ConnectionError);
  assert.equal(fetch.calls.length, 1);
});

test('CSV exports resolve to text and 204 to undefined', async () => {
  const fetch = fakeFetch(
    new Response('phone,name\n1,A\n', { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' } }),
    new Response(null, { status: 204 }),
  );
  const inboxly = client(fetch);
  assert.equal(await inboxly.contacts.export(), 'phone,name\n1,A\n');
  assert.equal(await inboxly.emailCampaigns.delete('e1'), undefined);
});

test('uploads a file from disk as multipart `file`', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inboxly-sdk-'));
  try {
    const path = join(dir, 'contacts.csv');
    await writeFile(path, 'phone\n123\n');
    const fetch = fakeFetch(json(200, { imported: 1 }));
    await client(fetch).contacts.import(path);
    const [call] = fetch.calls;
    assert.ok(call.body instanceof FormData);
    assert.equal(call.headers['content-type'], undefined);
    const file = call.body.get('file');
    assert.equal(file.name, 'contacts.csv');
    assert.equal(await file.text(), 'phone\n123\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a Buffer upload needs a filename', async () => {
  const inboxly = client(fakeFetch(json(200, {})));
  await assert.rejects(inboxly.templates.uploadMedia(Buffer.from('x')), /filename is required/);
});
