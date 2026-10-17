export interface InboxlyOptions {
  /** Defaults to the INBOXLY_API_KEY environment variable. */
  apiKey?: string;
  /** Server origin. Defaults to INBOXLY_BASE_URL, then https://inboxly-ybh3.onrender.com. */
  baseUrl?: string;
  /** Per-attempt timeout in ms. Default 60000. */
  timeoutMs?: number;
  /** Retries for 429s, and for 5xx / network errors on GET, PUT and DELETE. Default 2. */
  maxRetries?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export type FileInput = string | Blob | Uint8Array | ArrayBuffer;
export interface UploadOptions extends RequestOptions {
  filename?: string;
  contentType?: string;
}

type Id = string | number;
type Query = Record<string, string | number | boolean | Array<string | number> | null | undefined>;
type Body = Record<string, unknown>;
type Json = any;

export interface TemplateRef {
  name: string;
  language?: string | { code: string };
  variables?: Array<string | number>;
}

export type SendMessageInput =
  | { type: 'text'; to: string; body: string; waNumberId?: string }
  | { type: 'template'; to: string; template: TemplateRef; waNumberId?: string };

declare class Messages {
  send(message: SendMessageInput, opts?: RequestOptions): Promise<Json>;
  sendText(to: string, body: string, opts?: RequestOptions & { waNumberId?: string }): Promise<Json>;
  sendTemplate(to: string, template: TemplateRef, opts?: RequestOptions & { waNumberId?: string }): Promise<Json>;
}

declare class Numbers {
  list(opts?: RequestOptions): Promise<Json>;
  health(id: Id, opts?: RequestOptions): Promise<Json>;
}

declare class Conversations {
  list(query?: Query, opts?: RequestOptions): Promise<Json>;
  open(data: { contactId: string; waNumberId?: string }, opts?: RequestOptions): Promise<Json>;
  messages(id: Id, query?: { limit?: number; before?: string }, opts?: RequestOptions): Promise<Json>;
  sendMessage(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  sendTemplate(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
}

declare class Templates {
  list(query?: { waNumberId?: string; status?: string }, opts?: RequestOptions): Promise<Json>;
  get(id: Id, opts?: RequestOptions): Promise<Json>;
  create(data: Body, opts?: RequestOptions): Promise<Json>;
  update(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  delete(id: Id, opts?: RequestOptions): Promise<Json>;
  duplicate(id: Id, opts?: RequestOptions): Promise<Json>;
  restore(id: Id, opts?: RequestOptions): Promise<Json>;
  sync(data?: { waNumberId?: string }, opts?: RequestOptions): Promise<Json>;
  library(query?: Query, opts?: RequestOptions): Promise<Json>;
  installFromLibrary(libId: Id, data?: Body, opts?: RequestOptions): Promise<Json>;
  uploadMedia(file: FileInput, opts?: UploadOptions): Promise<Json>;
  getMedia(assetId: Id, opts?: RequestOptions): Promise<Buffer>;
}

declare class Campaigns {
  list(query?: { page?: number; limit?: number; type?: 'regular' | 'authentication' }, opts?: RequestOptions): Promise<Json>;
  get(id: Id, opts?: RequestOptions): Promise<Json>;
  create(data: Body, opts?: RequestOptions): Promise<Json>;
  update(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  estimate(data: Body, opts?: RequestOptions): Promise<Json>;
  importAudience(file: FileInput, opts?: UploadOptions): Promise<Json>;
  addRecipients(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  setRecipients(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  setRecipientValues(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  exportRecipients(id: Id, opts?: RequestOptions): Promise<string>;
  launch(id: Id, data?: Body, opts?: RequestOptions): Promise<Json>;
  pause(id: Id, opts?: RequestOptions): Promise<Json>;
  resume(id: Id, opts?: RequestOptions): Promise<Json>;
  cancel(id: Id, opts?: RequestOptions): Promise<Json>;
}

declare class EmailCampaigns {
  list(opts?: RequestOptions): Promise<Json>;
  get(id: Id, opts?: RequestOptions): Promise<Json>;
  create(data: Body, opts?: RequestOptions): Promise<Json>;
  compose(data: Body, opts?: RequestOptions): Promise<Json>;
  preview(data: Body, opts?: RequestOptions): Promise<Json>;
  sendTest(data: Body, opts?: RequestOptions): Promise<Json>;
  cancel(id: Id, opts?: RequestOptions): Promise<Json>;
  delete(id: Id, opts?: RequestOptions): Promise<Json>;
}

declare class Contacts {
  list(query?: Query, opts?: RequestOptions): Promise<Json>;
  get(id: Id, opts?: RequestOptions): Promise<Json>;
  create(data: Body, opts?: RequestOptions): Promise<Json>;
  update(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  replace(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  delete(id: Id, opts?: RequestOptions): Promise<Json>;
  tags(opts?: RequestOptions): Promise<Json>;
  export(query?: Query, opts?: RequestOptions): Promise<string>;
  import(file: FileInput, opts?: UploadOptions): Promise<Json>;
}

declare class Segments {
  list(opts?: RequestOptions): Promise<Json>;
  create(data: Body, opts?: RequestOptions): Promise<Json>;
  update(id: Id, data: Body, opts?: RequestOptions): Promise<Json>;
  delete(id: Id, opts?: RequestOptions): Promise<Json>;
  addContact(id: Id, contact: Body, opts?: RequestOptions): Promise<Json>;
  removeContact(id: Id, contactId: Id, opts?: RequestOptions): Promise<Json>;
}

declare class OptOuts {
  list(query?: { search?: string; status?: string; page?: number; limit?: number }, opts?: RequestOptions): Promise<Json>;
  block(phoneNumber: string, opts?: RequestOptions & { reason?: string }): Promise<Json>;
  unblock(id: Id, opts?: RequestOptions): Promise<Json>;
}

declare class Analytics {
  summary(opts?: RequestOptions & { days?: number }): Promise<Json>;
}

declare class Wallet {
  balance(opts?: RequestOptions): Promise<Json>;
  summary(opts?: RequestOptions): Promise<Json>;
}

declare class AiAgent {
  config(opts?: RequestOptions): Promise<Json>;
  query(message: string, opts?: RequestOptions & { mode?: 'general' | 'campaign'; campaignId?: string }): Promise<Json>;
}

declare class Automations {
  list(opts?: RequestOptions): Promise<Json>;
}

declare class Webhooks {
  register(webhookUrl: string, opts?: RequestOptions & { events?: string[] }): Promise<Json>;
}

export class Inboxly {
  constructor(options?: InboxlyOptions);
  me(opts?: RequestOptions): Promise<Json>;
  readonly messages: Messages;
  readonly numbers: Numbers;
  readonly conversations: Conversations;
  readonly templates: Templates;
  readonly campaigns: Campaigns;
  readonly emailCampaigns: EmailCampaigns;
  readonly contacts: Contacts;
  readonly segments: Segments;
  readonly optOuts: OptOuts;
  readonly analytics: Analytics;
  readonly wallet: Wallet;
  readonly aiAgent: AiAgent;
  readonly automations: Automations;
  readonly webhooks: Webhooks;
}
export default Inboxly;

export interface ErrorOptions {
  status?: number | null;
  code?: string | null;
  details?: Record<string, string[]> | null;
  body?: unknown;
  cause?: unknown;
}

export class InboxlyError extends Error {
  constructor(message: string, opts?: ErrorOptions);
  status: number | null;
  code: string | null;
  details: Record<string, string[]> | null;
  body: unknown;
}
export class ValidationError extends InboxlyError {}
export class AuthenticationError extends InboxlyError {}
export class PermissionError extends InboxlyError {}
export class NotFoundError extends InboxlyError {}
export class RateLimitError extends InboxlyError {
  retryAfterSeconds: number | null;
}
export class ConnectionError extends InboxlyError {}
