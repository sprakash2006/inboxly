import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// HTTP-level checks for the public API's campaign, email and inbox routes: the
// real router and requireScope() run against stubbed services. The key is
// stood in for by headers:
//
//   x-test-scopes  comma-separated scopes the key holds

const calls = [];

test.before(async () => {
  // Any model the router's imports touch at load time; no test reaches it.
  mock.module('../lib/prisma.js', { namedExports: { prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => null }) }) } });
  mock.module('../middleware/authenticateApiKey.js', {
    namedExports: {
      authenticateApiKey: (req, _res, next) => {
        const scopes = String(req.get('x-test-scopes') || '').split(',').filter(Boolean);
        req.workspaceId = 'ws1';
        req.apiKey = { id: 'k1', name: 'CI', scopes };
        req.user = { id: 'api-key:k1', workspaceId: 'ws1', role: 'CLIENT', superAdmin: false };
        next();
      },
    },
  });
  // Other modules import named helpers from these services, so the stubs keep
  // the real exports and replace only what the tests watch.
  const realEmail = await import('../services/emailCampaigns.service.js?actual');
  const realConversations = await import('../services/conversations.service.js?actual');
  mock.module('../services/emailCampaigns.service.js', {
    namedExports: {
      ...realEmail,
      list: async (ws) => { calls.push(['email.list', ws]); return []; },
      create: async (ws, userId, body) => { calls.push(['email.create', ws, userId, body.name]); return { id: 'e1' }; },
      cancel: async (ws, id) => { calls.push(['email.cancel', ws, id]); return { id, status: 'CANCELLED' }; },
      remove: async (ws, id) => { calls.push(['email.remove', ws, id]); },
    },
  });
  mock.module('../services/conversations.service.js', {
    namedExports: {
      ...realConversations,
      sendMessage: async (ws, id, userId, body) => { calls.push(['conv.send', ws, id, userId, body.body]); return { id: 'm1' }; },
      sendTemplateMessage: async (ws, id, userId) => { calls.push(['conv.template', ws, id, userId]); return { id: 'm2' }; },
    },
  });

  const { default: express } = await import('express');
  const { default: publicRoutes } = await import('./public.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/public', publicRoutes);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  await new Promise((resolve) => { globalThis.__server = app.listen(0, '127.0.0.1', resolve); });
});

test.after(() => globalThis.__server?.close());
test.beforeEach(() => { calls.length = 0; });

const call = (path, { method = 'GET', scopes = [], body } = {}) => fetch(
  `http://127.0.0.1:${globalThis.__server.address().port}/public${path}`,
  {
    method,
    headers: { 'content-type': 'application/json', 'x-test-scopes': scopes.join(',') },
    body: body ? JSON.stringify(body) : undefined,
  },
);

const emailDraft = { name: 'Diwali', subject: 'Offers inside', message: 'Hello', recipients: [{ email: 'a@example.com' }] };

test('email campaign writes need email-campaigns:write', async () => {
  const res = await call('/email-campaigns', { method: 'POST', scopes: ['email-campaigns:read'], body: emailDraft });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).requiredScope, 'email-campaigns:write');
  assert.equal(calls.length, 0);
});

test('an email campaign created by a key is scoped to its workspace and has no user author', async () => {
  const res = await call('/email-campaigns', { method: 'POST', scopes: ['email-campaigns:write'], body: emailDraft });
  assert.equal(res.status, 201);
  assert.deepEqual(calls, [['email.create', 'ws1', null, 'Diwali']]);
});

test('an invalid email campaign body is refused before the service runs', async () => {
  const res = await call('/email-campaigns', { method: 'POST', scopes: ['email-campaigns:write'], body: { ...emailDraft, recipients: [] } });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('cancel and delete reach the email service with the path id', async () => {
  const scopes = ['email-campaigns:write'];
  assert.equal((await call('/email-campaigns/e9/cancel', { method: 'POST', scopes })).status, 200);
  assert.equal((await call('/email-campaigns/e9', { method: 'DELETE', scopes })).status, 204);
  assert.deepEqual(calls, [['email.cancel', 'ws1', 'e9'], ['email.remove', 'ws1', 'e9']]);
});

test('a reply sent with a key is stored without a sender user', async () => {
  // senderUserId is a foreign key to User; "api-key:k1" would fail the insert.
  const res = await call('/conversations/c1/messages', { method: 'POST', scopes: ['conversations:write'], body: { type: 'text', body: 'Hi' } });
  assert.equal(res.status, 201);
  assert.deepEqual(calls, [['conv.send', 'ws1', 'c1', null, 'Hi']]);

  await call('/conversations/c1/template', { method: 'POST', scopes: ['conversations:write'], body: { templateId: 't1' } });
  assert.deepEqual(calls[1], ['conv.template', 'ws1', 'c1', null]);
});

test('reading conversations does not allow replying', async () => {
  const res = await call('/conversations/c1/messages', { method: 'POST', scopes: ['conversations:read'], body: { type: 'text', body: 'Hi' } });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});
