import { encodeId } from '../client.js';
import { toFormData } from '../files.js';

export class Contacts {
  constructor(http) { this.http = http; }

  // query: { page, limit, search, tag, ... } — the same filters as the dashboard.
  list(query, opts) { return this.http.get('/contacts', query, opts); }
  get(id, opts) { return this.http.get(`/contacts/${encodeId(id)}`, undefined, opts); }
  create(data, opts) { return this.http.post('/contacts', data, opts); }
  update(id, data, opts) { return this.http.patch(`/contacts/${encodeId(id)}`, data, opts); }
  replace(id, data, opts) { return this.http.put(`/contacts/${encodeId(id)}`, data, opts); }
  delete(id, opts) { return this.http.delete(`/contacts/${encodeId(id)}`, opts); }
  tags(opts) { return this.http.get('/contacts/tags', undefined, opts); }

  // Resolves to the CSV text. Takes the same filters as list().
  export(query, opts) { return this.http.get('/contacts/export', query, opts); }

  // Bulk import from a CSV with the same columns as the dashboard import.
  async import(file, { filename, ...opts } = {}) {
    const form = await toFormData(file, { filename, contentType: 'text/csv' });
    return this.http.upload('/contacts/import', form, opts);
  }
}

export class Segments {
  constructor(http) { this.http = http; }

  list(opts) { return this.http.get('/segments', undefined, opts); }
  create(data, opts) { return this.http.post('/segments', data, opts); }
  update(id, data, opts) { return this.http.patch(`/segments/${encodeId(id)}`, data, opts); }
  delete(id, opts) { return this.http.delete(`/segments/${encodeId(id)}`, opts); }

  // `contact` is { contactId } for an existing contact, or contact fields to create one.
  addContact(id, contact, opts) {
    return this.http.post(`/segments/${encodeId(id)}/contacts`, contact, opts);
  }

  removeContact(id, contactId, opts) {
    return this.http.delete(`/segments/${encodeId(id)}/contacts/${encodeId(contactId)}`, opts);
  }
}

export class OptOuts {
  constructor(http) { this.http = http; }

  // query: { search, status, page, limit }
  list(query, opts) { return this.http.get('/opt-outs', query, opts); }

  block(phoneNumber, { reason, ...opts } = {}) {
    return this.http.post('/opt-outs', { phoneNumber, reason }, opts);
  }

  unblock(id, opts) { return this.http.delete(`/opt-outs/${encodeId(id)}`, opts); }
}
