import { encodeId } from '../client.js';

export class Messages {
  constructor(http) { this.http = http; }

  // One-off WhatsApp send to a phone number. `message` is either
  // { type: 'text', to, body, waNumberId? } or
  // { type: 'template', to, template: { name, language?, variables? }, waNumberId? }.
  send(message, opts) {
    return this.http.post('/messages', message, opts);
  }

  sendText(to, body, { waNumberId, ...opts } = {}) {
    return this.send({ type: 'text', to, body, waNumberId }, opts);
  }

  sendTemplate(to, template, { waNumberId, ...opts } = {}) {
    return this.send({ type: 'template', to, template, waNumberId }, opts);
  }
}

export class Numbers {
  constructor(http) { this.http = http; }

  list(opts) { return this.http.get('/numbers', undefined, opts); }
  health(id, opts) { return this.http.get(`/numbers/${encodeId(id)}/health`, undefined, opts); }
}

export class Conversations {
  constructor(http) { this.http = http; }

  // query: { page, limit, contactId, search, cursor, view }
  list(query, opts) { return this.http.get('/conversations', query, opts); }

  // Opens (or finds) the conversation with a contact: { contactId, waNumberId? }.
  open(data, opts) { return this.http.post('/conversations', data, opts); }

  // query: { limit, before }
  messages(id, query, opts) {
    return this.http.get(`/conversations/${encodeId(id)}/messages`, query, opts);
  }

  sendMessage(id, data, opts) {
    return this.http.post(`/conversations/${encodeId(id)}/messages`, data, opts);
  }

  sendTemplate(id, data, opts) {
    return this.http.post(`/conversations/${encodeId(id)}/template`, data, opts);
  }
}
