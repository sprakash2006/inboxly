import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// A campaign audience CSV: contacts are created or matched by the Contacts
// import, and every other column comes back per contact for the template's
// variables.

let imported;
mock.module('./contacts.service.js', {
  namedExports: {
    importContacts: async () => imported,
    normalizePhone: (raw) => {
      const digits = String(raw || '').replace(/\D/g, '');
      return digits ? `+${digits.length === 10 ? `91${digits}` : digits}` : '';
    },
  },
});
mock.module('../lib/phone.js', { namedExports: { workspacePhoneCountry: async () => 'IN' } });

const { importCampaignAudience } = await import('./campaignAudience.service.js');

const csv = (text) => Buffer.from(text, 'utf8');

test('each row\'s other columns come back keyed by the matched contact', async () => {
  imported = {
    imported: 1, invalid: 0,
    contacts: [
      { id: 'c1', name: 'Priya', phoneNumber: '+919876543210' },
      { id: 'c2', name: 'Rahul', phoneNumber: '+919812345678' },
    ],
  };
  const out = await importCampaignAudience('ws1', csv(
    'name,phoneNumber,cart_item\nPriya,+91 98765 43210,Wireless Earbuds\nRahul,9812345678,Smart Watch\n',
  ));
  assert.deepEqual(out.columns, ['name', 'cart_item']);
  assert.deepEqual(out.values, {
    c1: { name: 'Priya', cart_item: 'Wireless Earbuds' },
    c2: { name: 'Rahul', cart_item: 'Smart Watch' },
  });
  assert.equal(out.matched, 2);
  assert.equal(out.created, 1);
});

test('an Excel byte-order mark does not hide the phone column', async () => {
  imported = { imported: 0, invalid: 0, contacts: [{ id: 'c1', name: 'Priya', phoneNumber: '+919876543210' }] };
  const out = await importCampaignAudience('ws1', csv('﻿phoneNumber,item\n+919876543210,Lamp\n'));
  assert.deepEqual(out.values, { c1: { item: 'Lamp' } });
});

test('the first row for a number wins and repeats are counted', async () => {
  imported = { imported: 0, invalid: 0, contacts: [{ id: 'c1', name: 'Priya', phoneNumber: '+919876543210' }] };
  const out = await importCampaignAudience('ws1', csv('phoneNumber,item\n+919876543210,Lamp\n+919876543210,Chair\n'));
  assert.deepEqual(out.values, { c1: { item: 'Lamp' } });
  assert.equal(out.repeated, 1);
});

test('a file without a phone column is refused with a clear message', async () => {
  await assert.rejects(() => importCampaignAudience('ws1', csv('name,item\nPriya,Lamp\n')), (err) => err.status === 400 && /phoneNumber/.test(err.message));
});
