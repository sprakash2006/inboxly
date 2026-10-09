import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, mockIdentity, startApp } from './crmHttp.testutil.js';

// CF-163: every CRM router has at least one request through the real
// authorize() and validate() layers, so a route whose guard or schema
// disagrees with what its service expects fails here rather than in
// production. Feature behaviour is covered by the other *.http.test.js files.

const store = createStore();
let app;

const ROUTERS = {
  '/leads': './leads.routes.js',
  '/deals': './deals.routes.js',
  '/tasks': './tasks.routes.js',
  '/activities': './activities.routes.js',
  '/crm-analytics': './crm-analytics.routes.js',
};

test.before(async () => {
  mock.module('../lib/prisma.js', { namedExports: { prisma: store.prisma } });
  mockIdentity(mock);
  mock.module('../services/workflowCrm.service.js', { namedExports: { emitCrmEvent: () => {} } });
  mock.module('../services/crmEvents.service.js', { namedExports: { emitCrmEvent: () => {}, emitCrmEvents: () => {}, applyLeadStatus: async () => ({ changed: false }), currentChainDepth: () => undefined } });
  const mounts = {};
  for (const [path, file] of Object.entries(ROUTERS)) mounts[path] = (await import(file)).default;
  app = await startApp(mounts);
});
test.after(() => app?.server.close());
test.beforeEach(() => store.reset());

// [method, path, role refused, role allowed past authorize(), a body validate() rejects (default {})]
const WRITES = [
  ['POST', '/leads', 'VIEWER', 'CLIENT'],
  ['POST', '/deals', 'VIEWER', 'CLIENT'],
  ['PATCH', '/deals/d1/stage', 'VIEWER', 'CLIENT'],
  ['POST', '/tasks', 'VIEWER', 'CLIENT'],
  ['POST', '/activities', 'VIEWER', 'AGENT'],
  ['DELETE', '/leads/l1', 'VIEWER', null],
  ['POST', '/leads/l1/convert', 'VIEWER', 'CLIENT'],
];

for (const [method, path, refused, allowed, badBody = {}] of WRITES) {
  test(`${method} ${path}: ${refused} is refused${allowed ? `, ${allowed} gets validation` : ''}`, async () => {
    const denied = await app.call(method, path, {}, { role: refused });
    assert.equal(denied.status, 403, `${refused} should be refused`);
    if (allowed) {
      const invalid = await app.call(method, path, badBody, { role: allowed });
      assert.equal(invalid.status, 400, `${allowed} with an invalid body should fail validation`);
    }
  });
}
