import test from 'node:test';
import assert from 'node:assert/strict';

// WF-EN-5: what {{2}} becomes when a sender has no value for it. By default
// nothing — a workflow template step once told every customer "order
// ORD-12345 ships on 12 Jan" from the template's approval samples. Senders
// whose template IS the message (a campaign, the inbox picker) opt into the
// samples explicitly.
const { contactVariableResolver } = await import('./templateParams.js');

const body = { type: 'BODY', text: 'Hi {{1}}, order {{2}} ships on {{3}}', example: { body_text: [['John', 'ORD-12345', '12 Jan']] } };

test('by default {{2}}+ never take the approval sample value', () => {
  const resolve = contactVariableResolver({ name: 'Asha' });
  const values = [0, 1, 2].map((i) => resolve(i, body));
  assert.deepEqual(values, ['Asha', '', '']);
  assert.ok(!values.includes('ORD-12345'));
});

test('a campaign (samples: true) keeps its approved sample values', () => {
  const resolve = contactVariableResolver({ name: 'Asha' }, { samples: true });
  assert.deepEqual([0, 1, 2].map((i) => resolve(i, body)), ['Asha', 'ORD-12345', '12 Jan']);
});

test('{{1}} is the contact name, or "there" without one', () => {
  assert.equal(contactVariableResolver({ name: '  ' })(0, body), 'there');
});

// Per-campaign mapping: {{n}} filled from the recipient's CSV row, fixed text
// or the name, instead of the template's samples.
const { campaignVariableResolver, missingCampaignVariables, templateVariableSlots } = await import('./templateParams.js');

const cart = { type: 'BODY', text: 'Hey {{1}}, you left {{2}} in your cart. {{3}} off today.', example: { body_text: [['Alex', 'a Bluetooth Speaker', '10%']] } };
const config = {
  columns: ['cart_item'],
  map: { 'BODY:1': { source: 'name' }, 'BODY:2': { source: 'column', column: 'cart_item' }, 'BODY:3': { source: 'text', value: '15%' } },
};

test('a mapped campaign fills each variable from its own source', () => {
  const resolve = campaignVariableResolver({ name: 'Priya' }, { config, values: { cart_item: 'Wireless Earbuds' } });
  assert.deepEqual([0, 1, 2].map((i) => resolve(i, cart)), ['Priya', 'Wireless Earbuds', '15%']);
});

test('without a mapping a campaign keeps the original name-then-samples rule', () => {
  const resolve = campaignVariableResolver({ name: 'Priya' }, { config: null });
  assert.deepEqual([0, 1, 2].map((i) => resolve(i, cart)), ['Priya', 'a Bluetooth Speaker', '10%']);
});

test('a slot with no rule falls back to the sample, even when others are mapped', () => {
  const partial = { columns: [], map: { 'BODY:3': { source: 'text', value: '20%' } } };
  const resolve = campaignVariableResolver({ name: 'Priya' }, { config: partial });
  assert.deepEqual([0, 1, 2].map((i) => resolve(i, cart)), ['Priya', 'a Bluetooth Speaker', '20%']);
});

test('a recipient with an empty CSV cell is reported missing, never given the sample', () => {
  assert.deepEqual(missingCampaignVariables([cart], config, { cart_item: 'Earbuds' }), []);
  assert.equal(missingCampaignVariables([cart], config, { cart_item: '  ' }).length, 1);
  assert.match(missingCampaignVariables([cart], config, null)[0], /\{\{2\}\}.*cart_item/);
  const resolve = campaignVariableResolver({ name: 'Priya' }, { config, values: { cart_item: '' } });
  assert.equal(resolve(1, cart), '');
});

test('header and body variables are separate slots', () => {
  const header = { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' };
  const slots = templateVariableSlots([header, cart]).map((s) => s.key);
  assert.deepEqual(slots, ['HEADER:1', 'BODY:1', 'BODY:2', 'BODY:3']);
  const resolve = campaignVariableResolver({ name: 'Priya' }, {
    config: { columns: ['order'], map: { 'HEADER:1': { source: 'column', column: 'order' } } },
    values: { order: '#1042' },
  });
  assert.equal(resolve(0, header), '#1042');
  assert.equal(resolve(0, cart), 'Priya');
});
