import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignSchemas } from './index.js';

const DLT = { dltTemplateId: '1007161234567890123', dltEntityId: '1201161234567890123' };
const base = { name: 'Diwali', templateId: 'cltemplate0000000000000001', numberId: 'clnumber00000000000000001' };

test('the retry config the wizard sends is accepted; schedules derived by the server are stripped', () => {
  const out = campaignSchemas.create.parse({
    ...base,
    retryConfig: { active: true, endDate: '', pattern: 'smart', noRetryStart: '09:00 PM', noRetryEnd: '06:00 AM', smartRetrySchedule: [1, 2, 3] },
  });
  assert.equal(out.retryConfig.pattern, 'smart');
  assert.equal(out.retryConfig.smartRetrySchedule, undefined);
});

test('a malformed retry config is refused', () => {
  assert.throws(() => campaignSchemas.create.parse({ ...base, retryConfig: { pattern: 'every-second' } }));
  assert.throws(() => campaignSchemas.create.parse({ ...base, retryConfig: 'yes' }));
});

test('fallback config is bounded', () => {
  assert.throws(() => campaignSchemas.create.parse({ ...base, fallbackConfig: { smsEnabled: true, smsText: 'x'.repeat(5000) } }));
  const ok = campaignSchemas.create.parse({ ...base, fallbackConfig: { smsEnabled: true, smsFrom: 'SPNDAN', smsText: 'Hi {{1}}', ...DLT } });
  assert.equal(ok.fallbackConfig.emailEnabled, false);
});

test('SMS fallback cannot be enabled without its DLT registration', () => {
  const sms = { smsEnabled: true, smsFrom: 'SPNDAN', smsText: 'Hi {{1}}', ...DLT };
  for (const missing of ['dltTemplateId', 'dltEntityId', 'smsFrom', 'smsText']) {
    const r = campaignSchemas.create.safeParse({ ...base, fallbackConfig: { ...sms, [missing]: '' } });
    assert.equal(r.success, false, missing);
    assert.deepEqual(r.error.issues[0].path, ['fallbackConfig', missing]);
  }
  assert.equal(campaignSchemas.create.safeParse({ ...base, fallbackConfig: { ...sms, dltTemplateId: '12345' } }).success, false);
  // Email-only fallback needs none of it.
  assert.equal(campaignSchemas.update.safeParse({ fallbackConfig: { smsEnabled: false, emailEnabled: true } }).success, true);
});

test('reply flows and conversion tracking are refused until they exist, but null is tolerated', () => {
  assert.throws(() => campaignSchemas.create.parse({ ...base, replyRules: [{ keyword: 'hi' }] }), /not available/);
  assert.throws(() => campaignSchemas.update.parse({ trackingConfig: { utmEnabled: true } }), /not available/);
  assert.doesNotThrow(() => campaignSchemas.create.parse({ ...base, replyRules: null, trackingConfig: null }));
});

test('unknown top-level keys are dropped instead of passed through', () => {
  const out = campaignSchemas.update.parse({ name: 'x1', somethingElse: { big: true } });
  assert.equal(out.somethingElse, undefined);
});

test('a variable mapping is accepted when every column it names was uploaded', () => {
  const variableConfig = {
    columns: ['cart_item'],
    map: { 'BODY:1': { source: 'name' }, 'BODY:2': { source: 'column', column: 'cart_item' }, 'BODY:3': { source: 'text', value: '15%' } },
  };
  assert.deepEqual(campaignSchemas.create.parse({ ...base, variableConfig }).variableConfig, variableConfig);
  assert.equal(campaignSchemas.update.parse({ variableConfig: null }).variableConfig, null);
});

test('a variable mapping cannot name a missing column, leave fixed text empty, or use an unknown slot', () => {
  const bad = [
    { columns: [], map: { 'BODY:2': { source: 'column', column: 'cart_item' } } },
    { columns: [], map: { 'BODY:2': { source: 'text', value: '  ' } } },
    { columns: [], map: { 'FOOTER:1': { source: 'name' } } },
    { columns: [], map: { 'BODY:2': { source: 'ai' } } },
  ];
  for (const variableConfig of bad) {
    assert.equal(campaignSchemas.update.safeParse({ variableConfig }).success, false, JSON.stringify(variableConfig));
  }
});

test('recipient values are bounded per request', () => {
  const ok = campaignSchemas.recipientValues.parse({ values: { c1: { item: 'Lamp', qty: 2 } } });
  assert.deepEqual(ok, { values: { c1: { item: 'Lamp', qty: '2' } }, replace: false });
  const tooMany = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`c${i}`, { item: 'x' }]));
  assert.equal(campaignSchemas.recipientValues.safeParse({ values: tooMany }).success, false);
});
