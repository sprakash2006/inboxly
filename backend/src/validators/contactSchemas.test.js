import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactSchemas } from './index.js';

const create = (body) => contactSchemas.create.safeParse(body);

test('a contact needs a name', () => {
  const r = create({ name: '  ', phoneNumber: '+919876543210' });
  assert.equal(r.success, false);
  assert.match(r.error.issues[0].message, /Name is required/);
});

test('a contact needs a phone number or an email', () => {
  const r = create({ name: 'Priya', phoneNumber: '', email: '' });
  assert.equal(r.success, false);
  assert.match(r.error.issues[0].message, /phone number or an email/);
});

test('phone only, email only, or both are all accepted', () => {
  assert.equal(create({ name: 'Priya', phoneNumber: '+919876543210' }).success, true);
  const emailOnly = create({ name: 'Priya', email: 'priya@example.com' });
  assert.equal(emailOnly.success, true);
  assert.equal(emailOnly.data.phoneNumber, null);
  assert.equal(create({ name: 'Priya', phoneNumber: '+919876543210', email: 'priya@example.com' }).success, true);
});

test('a malformed email is refused even when a phone is given', () => {
  assert.equal(create({ name: 'Priya', phoneNumber: '+919876543210', email: 'not-an-email' }).success, false);
});

test('an update may clear the phone; the service checks an email remains', () => {
  const r = contactSchemas.update.safeParse({ phoneNumber: '' });
  assert.equal(r.success, true);
  assert.equal(r.data.phoneNumber, null);
});
