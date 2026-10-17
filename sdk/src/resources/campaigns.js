import { encodeId } from '../client.js';
import { toFormData } from '../files.js';

export class Campaigns {
  constructor(http) { this.http = http; }

  // query: { page, limit, type: 'regular' | 'authentication' }
  list(query, opts) { return this.http.get('/campaigns', query, opts); }
  get(id, opts) { return this.http.get(`/campaigns/${encodeId(id)}`, undefined, opts); }
  create(data, opts) { return this.http.post('/campaigns', data, opts); }
  update(id, data, opts) { return this.http.patch(`/campaigns/${encodeId(id)}`, data, opts); }

  // What a send would cost before launching it: quota used, wallet charge,
  // per-category price.
  estimate(data, opts) { return this.http.post('/campaigns/estimate', data, opts); }

  // A CSV of recipients with a value per person for the template's variables.
  // Creates or matches the contacts; returns their ids and each row's values.
  async importAudience(file, { filename, ...opts } = {}) {
    const form = await toFormData(file, { filename, contentType: 'text/csv' });
    return this.http.upload('/campaigns/audience-import', form, opts);
  }

  addRecipients(id, data, opts) {
    return this.http.post(`/campaigns/${encodeId(id)}/recipients`, data, opts);
  }

  setRecipients(id, data, opts) {
    return this.http.put(`/campaigns/${encodeId(id)}/recipients`, data, opts);
  }

  setRecipientValues(id, data, opts) {
    return this.http.put(`/campaigns/${encodeId(id)}/recipient-values`, data, opts);
  }

  // Resolves to the CSV text.
  exportRecipients(id, opts) {
    return this.http.get(`/campaigns/${encodeId(id)}/recipients/export`, undefined, opts);
  }

  launch(id, data = {}, opts) { return this.http.post(`/campaigns/${encodeId(id)}/launch`, data, opts); }
  pause(id, opts) { return this.http.post(`/campaigns/${encodeId(id)}/pause`, undefined, opts); }
  resume(id, opts) { return this.http.post(`/campaigns/${encodeId(id)}/resume`, undefined, opts); }
  cancel(id, opts) { return this.http.post(`/campaigns/${encodeId(id)}/cancel`, undefined, opts); }
}

export class EmailCampaigns {
  constructor(http) { this.http = http; }

  list(opts) { return this.http.get('/email-campaigns', undefined, opts); }
  get(id, opts) { return this.http.get(`/email-campaigns/${encodeId(id)}`, undefined, opts); }
  create(data, opts) { return this.http.post('/email-campaigns', data, opts); }

  // AI rewrite of a plain message into a structured email. Sends nothing.
  compose(data, opts) { return this.http.post('/email-campaigns/compose', data, opts); }

  // The rendered HTML of a draft, exactly as recipients will get it. Sends nothing.
  preview(data, opts) { return this.http.post('/email-campaigns/preview', data, opts); }

  // Sends one test copy to a real inbox.
  sendTest(data, opts) { return this.http.post('/email-campaigns/test', data, opts); }

  cancel(id, opts) { return this.http.post(`/email-campaigns/${encodeId(id)}/cancel`, undefined, opts); }
  delete(id, opts) { return this.http.delete(`/email-campaigns/${encodeId(id)}`, opts); }
}
