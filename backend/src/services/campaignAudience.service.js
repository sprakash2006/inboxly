import { parse } from 'csv-parse/sync';
import { importContacts, normalizePhone } from './contacts.service.js';
import { workspacePhoneCountry } from '../lib/phone.js';

// A campaign audience uploaded as a CSV, with a value per recipient for the
// template's variables:
//
//   phoneNumber,name,cart_item,discount
//   +919876543210,Priya,Bluetooth headphones,15%
//
// The contacts are created or matched exactly as the Contacts import does
// (importContacts), and every column other than the phone becomes something a
// template variable can be filled from. Nothing is attached to a campaign here:
// the builder calls this before the campaign exists, then saves the returned
// values against the campaign's recipients (campaigns.service#setRecipientValues).

// The headers importContacts reads the phone number from.
const PHONE_HEADERS = ['phoneNumber', 'phone', 'Phone', 'PhoneNumber'];
const MAX_COLUMNS = 50;
const MAX_VALUE = 1000;
const MAX_ROWS = 10_000;

export async function importCampaignAudience(workspaceId, file) {
  // Excel writes a byte-order mark before the first header; left in, the
  // first column reads as "﻿phoneNumber" and is never found.
  const csvBuffer = Buffer.from(String(file).replace(/^﻿/, ''), 'utf8');
  let records;
  try {
    records = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    const e = new Error(`Could not read the CSV: ${err.message}`); e.status = 400; throw e;
  }
  if (records.length === 0) { const e = new Error('The CSV has no rows.'); e.status = 400; throw e; }
  if (records.length > MAX_ROWS) {
    const e = new Error(`A campaign can go to at most ${MAX_ROWS.toLocaleString('en-IN')} people; this file has ${records.length.toLocaleString('en-IN')} rows.`);
    e.status = 400; throw e;
  }

  const headers = Object.keys(records[0]);
  const phoneHeader = PHONE_HEADERS.find((h) => headers.includes(h));
  if (!phoneHeader) {
    const e = new Error('The CSV needs a phoneNumber column with each person\'s WhatsApp number.'); e.status = 400; throw e;
  }
  const columns = headers.filter((h) => h && h !== phoneHeader).slice(0, MAX_COLUMNS);

  const imported = await importContacts(workspaceId, csvBuffer);

  // Rows are matched back to contacts by number, in the same canonical form
  // the import stored them under. Email-only contacts cannot get WhatsApp.
  const country = await workspacePhoneCountry(workspaceId);
  const byPhone = new Map();
  for (const c of imported.contacts) {
    if (c.phoneNumber) byPhone.set(normalizePhone(c.phoneNumber, { country }), c);
  }

  const values = {};
  const contacts = [];
  let repeated = 0;
  for (const row of records) {
    const contact = byPhone.get(normalizePhone(row[phoneHeader], { country }));
    if (!contact) continue;
    // The first row for a number wins, as it does in the contact import.
    if (values[contact.id]) { repeated++; continue; }
    values[contact.id] = Object.fromEntries(columns.map((col) => [col, String(row[col] ?? '').trim().slice(0, MAX_VALUE)]));
    contacts.push({ id: contact.id, name: contact.name, phoneNumber: contact.phoneNumber });
  }

  return {
    columns,
    contacts,
    values,
    totalRows: records.length,
    created: imported.imported,
    matched: contacts.length,
    repeated,
    invalid: imported.invalid,
  };
}
