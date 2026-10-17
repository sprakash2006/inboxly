export class Analytics {
  constructor(http) { this.http = http; }

  summary({ days, ...opts } = {}) { return this.http.get('/analytics/summary', { days }, opts); }
}

export class Wallet {
  constructor(http) { this.http = http; }

  balance(opts) { return this.http.get('/wallet/balance', undefined, opts); }
  summary(opts) { return this.http.get('/wallet/summary', undefined, opts); }
}

export class AiAgent {
  constructor(http) { this.http = http; }

  config(opts) { return this.http.get('/ai-agent/config', undefined, opts); }

  // Asks the workspace's AI agent a sample question and returns its reply.
  // options: { mode: 'general' | 'campaign', campaignId }
  query(message, { mode, campaignId, ...opts } = {}) {
    return this.http.post('/ai-agent/query', { message, mode, campaignId }, opts);
  }
}

export class Automations {
  constructor(http) { this.http = http; }

  list(opts) { return this.http.get('/automations', undefined, opts); }
}

export class Webhooks {
  constructor(http) { this.http = http; }

  // Registers the workspace webhook URL. The response includes the signing
  // secret the receiver needs to verify deliveries.
  register(webhookUrl, { events, ...opts } = {}) {
    return this.http.post('/webhooks', { webhookUrl, webhookEvents: events }, opts);
  }
}
