import { HttpClient } from './client.js';
import { Messages, Numbers, Conversations } from './resources/messaging.js';
import { Templates } from './resources/templates.js';
import { Campaigns, EmailCampaigns } from './resources/campaigns.js';
import { Contacts, Segments, OptOuts } from './resources/contacts.js';
import { Analytics, Wallet, AiAgent, Automations, Webhooks } from './resources/workspace.js';

export class Inboxly {
  // options: { apiKey, baseUrl, timeoutMs, maxRetries, fetch }
  // apiKey and baseUrl fall back to INBOXLY_API_KEY and INBOXLY_BASE_URL.
  constructor(options = {}) {
    const env = globalThis.process?.env ?? {};
    const http = new HttpClient({
      ...options,
      apiKey: options.apiKey ?? env.INBOXLY_API_KEY,
      baseUrl: options.baseUrl ?? env.INBOXLY_BASE_URL,
    });
    Object.defineProperty(this, 'http', { value: http });

    this.messages = new Messages(http);
    this.numbers = new Numbers(http);
    this.conversations = new Conversations(http);
    this.templates = new Templates(http);
    this.campaigns = new Campaigns(http);
    this.emailCampaigns = new EmailCampaigns(http);
    this.contacts = new Contacts(http);
    this.segments = new Segments(http);
    this.optOuts = new OptOuts(http);
    this.analytics = new Analytics(http);
    this.wallet = new Wallet(http);
    this.aiAgent = new AiAgent(http);
    this.automations = new Automations(http);
    this.webhooks = new Webhooks(http);
  }

  // Which workspace this key belongs to and which numbers it can send from.
  me(opts) {
    return this.http.get('/me', undefined, opts);
  }
}

export default Inboxly;
export * from './errors.js';
