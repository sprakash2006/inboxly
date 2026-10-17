# inboxly

The official Node.js library for the [Inboxly](https://github.com/sprakash2006/inboxly) API. Send WhatsApp messages, run WhatsApp and email campaigns, and manage contacts from your own app, with plain function calls.

```js
import Inboxly from 'inboxly';

const inboxly = new Inboxly({ apiKey: process.env.INBOXLY_API_KEY });

await inboxly.messages.sendText('+919876543210', 'Your order has shipped!');
```

- No dependencies. Uses the `fetch` built into Node.
- TypeScript types included.
- Typed errors you can catch: `ValidationError`, `RateLimitError` and others.
- Retries automatically when rate limited, and on server errors where it's safe.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Getting an API key](#getting-an-api-key)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Uploading files](#uploading-files)
- [Return values](#return-values)
- [Error handling](#error-handling)
- [Retries and rate limits](#retries-and-rate-limits)
- [Cancelling a request](#cancelling-a-request)
- [TypeScript](#typescript)
- [Security](#security)
- [How it works](#how-it-works)

## Requirements

- Node.js **20.3** or newer
- An Inboxly workspace and an API key
- The address of the Inboxly server you are calling

## Installation

```bash
npm install inboxly
```

The package is an ES module. Use `import`:

```js
import Inboxly from 'inboxly';
```

From a CommonJS file, use a dynamic import:

```js
const { default: Inboxly } = await import('inboxly');
```

## Getting an API key

1. Sign in to your Inboxly dashboard.
2. Open **Channels & API → API Keys** and create a key. Only workspace admins can do this.
3. Choose the **scopes** the key needs. A call outside its scopes fails with `PermissionError`.
4. Copy the key. It is shown only once.

| Scope | Lets the key |
|---|---|
| `messages:send` | Send WhatsApp text and template messages |
| `numbers:read` | List connected WhatsApp numbers and check their health |
| `conversations:read` | List inbox conversations and read their messages |
| `conversations:write` | Open conversations and reply in them |
| `templates:read` | List and read message templates |
| `templates:write` | Create templates and submit them to Meta for review |
| `campaigns:read` | List campaigns, read results, estimate costs |
| `campaigns:write` | Create and launch campaigns. **Launching spends the wallet.** |
| `email-campaigns:read` | List email campaigns and preview drafts |
| `email-campaigns:write` | Compose, test, send, schedule, cancel and delete email campaigns |
| `contacts:read` | List, read and export contacts and segments |
| `contacts:write` | Create, update, import and delete contacts and segments |
| `opt-outs:read` | List numbers that opted out or were blocked |
| `opt-outs:write` | Block and unblock numbers |
| `analytics:read` | Read workspace analytics |
| `wallet:read` | Read the wallet balance |
| `ai-agent:read` | Read the AI agent's settings |
| `ai-agent:write` | Ask the AI agent a question |
| `automations:read` | List automations |
| `webhooks:write` | Change the workspace webhook URL |

`inboxly.me()` needs no scope, so a key can always check which workspace it belongs to.

## Quick start

```bash
export INBOXLY_API_KEY="your-api-key"
```

```js
import Inboxly from 'inboxly';

const inboxly = new Inboxly(); // reads INBOXLY_API_KEY, connects to the hosted Inboxly server

// Check the key works and see which workspace it belongs to
const me = await inboxly.me();
console.log(me);

// Send a message
await inboxly.messages.sendText('+919876543210', 'Hello from Inboxly!');
```

> WhatsApp only allows free-form text to someone who has messaged you in the last 24 hours. To start a conversation, send an approved **template** with `messages.sendTemplate`.

## Configuration

```js
const inboxly = new Inboxly({
  apiKey: 'your-api-key',                       // default: INBOXLY_API_KEY
  baseUrl: 'https://inboxly-ybh3.onrender.com', // default: INBOXLY_BASE_URL, then the hosted server
  timeoutMs: 60_000,                            // per attempt
  maxRetries: 2,                                // see "Retries and rate limits"
  fetch: customFetch,                           // optional: your own fetch implementation
});
```

By default the library talks to the hosted Inboxly server at `https://inboxly-ybh3.onrender.com`. Set `baseUrl` (or `INBOXLY_BASE_URL`) only if you run your own Inboxly server, for example `http://localhost:4000` during development. Give the server's origin only: the library adds `/api/v1/public` itself.

> The hosted server goes to sleep when idle, so the first request after a quiet period can take up to a minute while it wakes. That is why the default timeout is 60 seconds. Later requests are fast.

## API reference

Every function returns a Promise. Request bodies are sent to the server unchanged, so they use the same field names as the Inboxly API.

The last argument of every function is an optional `{ signal }` for [cancelling](#cancelling-a-request). For brevity it is left out below.

### Identity

```js
await inboxly.me();
```

Returns the workspace the key belongs to and the WhatsApp numbers it can send from.

### Messages

Send one WhatsApp message to a phone number. Scope: `messages:send`.

```js
// Free-form text (only inside the 24-hour window)
await inboxly.messages.sendText('+919876543210', 'Your order has shipped!');

// An approved template, with values for {{1}}, {{2}}, ...
await inboxly.messages.sendTemplate('+919876543210', {
  name: 'order_update',
  language: 'en_US',            // or { code: 'en_US' }
  variables: ['Asha', '#1042'],
});

// Send from a specific number when the workspace has more than one
await inboxly.messages.sendText('+919876543210', 'Hi', { waNumberId: 'num_123' });

// Or the general form
await inboxly.messages.send({ type: 'text', to: '+919876543210', body: 'Hi' });
```

### WhatsApp numbers

Scope: `numbers:read`.

| Function | Does |
|---|---|
| `numbers.list()` | Connected WhatsApp numbers |
| `numbers.health(id)` | Quality rating and status of one number |

### Conversations

The WhatsApp inbox. Scopes: `conversations:read` and `conversations:write`.

| Function | Does |
|---|---|
| `conversations.list(query?)` | List conversations. `query`: `{ page, limit, contactId, search, cursor, view }` |
| `conversations.open({ contactId, waNumberId? })` | Find or start the conversation with a contact |
| `conversations.messages(id, query?)` | Messages in a conversation. `query`: `{ limit, before }` |
| `conversations.sendMessage(id, { type: 'text', body })` | Reply with text |
| `conversations.sendTemplate(id, { templateId, variables })` | Reply with a template (required after the 24-hour window closes) |

```js
const convo = await inboxly.conversations.open({ contactId: 'contact_123' });
await inboxly.conversations.sendMessage(convo.id, { type: 'text', body: 'Thanks for reaching out!' });
```

### Templates

Scopes: `templates:read` and `templates:write`.

| Function | Does |
|---|---|
| `templates.list(query?)` | List templates. `query`: `{ waNumberId, status }` |
| `templates.get(id)` | One template |
| `templates.create(data)` | Create a template and submit it to Meta for review |
| `templates.update(id, data)` | Edit a template |
| `templates.delete(id)` | Delete a template |
| `templates.duplicate(id)` | Copy a template |
| `templates.restore(id)` | Restore a deleted template |
| `templates.sync({ waNumberId? })` | Pull the latest templates and review status from Meta |
| `templates.library(query?)` | Ready-made templates you can install |
| `templates.installFromLibrary(libId, data?)` | Install a library template |
| `templates.uploadMedia(file, opts?)` | Upload a header image, video or document. Returns the handle for the HEADER component. |
| `templates.getMedia(assetId)` | Download stored header media (returns a `Buffer`) |

```js
await inboxly.templates.create({
  name: 'order_update',            // lowercase letters, numbers and underscores
  category: 'UTILITY',             // MARKETING | UTILITY | AUTHENTICATION
  language: 'en_US',
  components: [
    { type: 'BODY', text: 'Hi {{1}}, your order {{2}} has shipped.', example: { body_text: [['Asha', '#1042']] } },
  ],
});
```

### WhatsApp campaigns

Send a template to many contacts. Scopes: `campaigns:read` and `campaigns:write`.

| Function | Does |
|---|---|
| `campaigns.list(query?)` | List campaigns. `query`: `{ page, limit, type: 'regular' \| 'authentication' }` |
| `campaigns.get(id)` | One campaign with its results |
| `campaigns.create(data)` | Create a draft campaign |
| `campaigns.update(id, data)` | Edit a draft |
| `campaigns.estimate({ contactIds? , campaignId?, templateId? })` | Cost before sending: quota used, wallet charge, price per category |
| `campaigns.addRecipients(id, { contactIds })` | Add contacts to the audience |
| `campaigns.setRecipients(id, { contactIds })` | Replace the audience |
| `campaigns.importAudience(file)` | Upload a CSV of recipients with per-person variable values |
| `campaigns.setRecipientValues(id, { values, replace? })` | Set per-recipient variable values (max 2,000 recipients per call) |
| `campaigns.exportRecipients(id)` | Recipients and their delivery status as CSV text |
| `campaigns.launch(id, { scheduledAt? })` | Send now, or schedule. **Spends the wallet.** |
| `campaigns.pause(id)` / `resume(id)` / `cancel(id)` | Control a running campaign |

```js
const campaign = await inboxly.campaigns.create({
  name: 'Diwali sale',
  templateId: 'tmpl_123',
  numberId: 'num_123',
});

await inboxly.campaigns.addRecipients(campaign.id, { contactIds: ['c_1', 'c_2', 'c_3'] });

const cost = await inboxly.campaigns.estimate({ campaignId: campaign.id });
console.log(cost);

await inboxly.campaigns.launch(campaign.id);                                       // now
await inboxly.campaigns.launch(campaign.id, { scheduledAt: '2026-11-01T09:00:00+05:30' }); // or later
```

### Email campaigns

Scopes: `email-campaigns:read` and `email-campaigns:write`.

| Function | Does |
|---|---|
| `emailCampaigns.list()` | List email campaigns |
| `emailCampaigns.get(id)` | One campaign with its results |
| `emailCampaigns.compose({ message, tone?, subject? })` | AI rewrite of a plain message into a formatted email. Sends nothing. |
| `emailCampaigns.preview(draft)` | The rendered HTML, exactly as recipients will see it. Sends nothing. |
| `emailCampaigns.sendTest({ ...draft, to, subject })` | Send one test copy to an inbox |
| `emailCampaigns.create({ ...draft, name, subject, recipients, scheduledAt? })` | Send now, or schedule |
| `emailCampaigns.cancel(id)` | Cancel a scheduled campaign |
| `emailCampaigns.delete(id)` | Delete a campaign |

`tone` is one of `friendly`, `professional`, `promotional` or `short`.

```js
await inboxly.emailCampaigns.create({
  name: 'November newsletter',
  subject: 'What’s new this month',
  message: 'Hi there! Here is what we shipped this month...',
  recipients: [
    { email: 'asha@example.com', name: 'Asha' },
    { email: 'ravi@example.com' },
  ],
});
```

### Contacts

Scopes: `contacts:read` and `contacts:write`.

| Function | Does |
|---|---|
| `contacts.list(query?)` | List contacts. `query`: `{ page, limit, search, tags, status, segmentId, sort, createdFrom, createdTo, ... }` |
| `contacts.get(id)` | One contact |
| `contacts.create(data)` | Create a contact |
| `contacts.update(id, data)` | Change some fields |
| `contacts.replace(id, data)` | Replace the contact |
| `contacts.delete(id)` | Delete a contact |
| `contacts.tags()` | All tags in use |
| `contacts.export(query?)` | Contacts as CSV text (same filters as `list`) |
| `contacts.import(file)` | Bulk import from a CSV |

```js
await inboxly.contacts.create({
  name: 'Asha',
  phoneNumber: '+919876543210', // a phone number, an email, or both
  email: 'asha@example.com',
  tags: ['vip'],
});
```

### Segments

Saved audiences for campaigns. Scopes: `contacts:read` and `contacts:write`.

| Function | Does |
|---|---|
| `segments.list()` | List segments |
| `segments.create(data)` | Create a segment |
| `segments.update(id, data)` | Edit a segment |
| `segments.delete(id)` | Delete a segment |
| `segments.addContact(id, { contactId })` | Add an existing contact (or pass contact fields to create one) |
| `segments.removeContact(id, contactId)` | Remove a contact |

### Opt-outs

Numbers that must not be messaged. Scopes: `opt-outs:read` and `opt-outs:write`.

| Function | Does |
|---|---|
| `optOuts.list(query?)` | List blocked numbers. `query`: `{ search, status, page, limit }` |
| `optOuts.block(phoneNumber, { reason? })` | Block a number |
| `optOuts.unblock(id)` | Unblock it |

### Analytics, wallet, AI agent, automations

| Function | Scope | Does |
|---|---|---|
| `analytics.summary({ days? })` | `analytics:read` | Workspace overview for the last `days` days |
| `wallet.balance()` | `wallet:read` | Current balance |
| `wallet.summary()` | `wallet:read` | Spending summary |
| `aiAgent.config()` | `ai-agent:read` | The AI agent's persona and settings |
| `aiAgent.query(message, { mode?, campaignId? })` | `ai-agent:write` | Ask the AI agent a question and get its reply. `mode`: `general` or `campaign` |
| `automations.list()` | `automations:read` | Active automations |

### Webhooks

Get notified when messages arrive or change status. Scope: `webhooks:write`.

```js
const settings = await inboxly.webhooks.register('https://example.com/hooks/inboxly', {
  events: ['messages', 'deliveries', 'reads'], // also: 'reactions', 'referrals'
});
// settings includes the signing secret your endpoint uses to verify deliveries
```

The URL must be publicly reachable. The server refuses private and local addresses.

## Uploading files

`contacts.import`, `campaigns.importAudience` and `templates.uploadMedia` accept any of these:

```js
await inboxly.contacts.import('./contacts.csv');                       // a path

await inboxly.contacts.import(buffer, { filename: 'contacts.csv' });   // a Buffer (filename required)

await inboxly.templates.uploadMedia(blob);                             // a Blob or File

await inboxly.templates.uploadMedia(buffer, {
  filename: 'header.jpg',
  contentType: 'image/jpeg',
});
```

Limits: CSV files up to 10 MB, and template media up to 100 MB.

## Return values

| Response | You get |
|---|---|
| JSON | The parsed object |
| CSV export (`contacts.export`, `campaigns.exportRecipients`) | A string |
| Media (`templates.getMedia`) | A `Buffer` |
| No content (HTTP 204) | `undefined` |

## Error handling

Every failed call throws an `InboxlyError` or one of its subclasses:

```js
import Inboxly, {
  InboxlyError, ValidationError, AuthenticationError, PermissionError,
  NotFoundError, RateLimitError, ConnectionError,
} from 'inboxly';

try {
  await inboxly.messages.sendText('+919876543210', '');
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.message);  // "`body` is required when type is \"text\""
    console.log(err.details);  // per-field messages, when the server sends them
  } else if (err instanceof RateLimitError) {
    console.log(`Slow down. Try again in ${err.retryAfterSeconds}s`);
  } else if (err instanceof InboxlyError) {
    console.log(err.status, err.code, err.message);
  } else {
    throw err;
  }
}
```

| Error | When |
|---|---|
| `ValidationError` | 400: the request body is invalid |
| `AuthenticationError` | 401: the API key is missing, wrong or revoked |
| `PermissionError` | 403: the key lacks the scope, or the workspace is suspended or its subscription is inactive |
| `NotFoundError` | 404: no such item in this workspace |
| `RateLimitError` | 429: still rate limited after retrying |
| `ConnectionError` | The server could not be reached, or the request timed out |
| `InboxlyError` | The base class, and any other error status |

Every error has `status`, `code`, `details` and the raw response `body`.

## Retries and rate limits

The server limits each key to **300 requests a minute**. Sending is limited further: **60 sends a minute per key**, and **10 a minute to the same recipient**.

The library handles this for you:

- **Rate limited (429):** waits for the time the server asks (`Retry-After`), then tries again. This is safe for every request, because a rate-limited request was refused before it did anything.
- **Server errors (5xx) and network failures:** retried only for `GET`, `PUT` and `DELETE`, with growing delays between tries.
- **`POST` requests** (sending a message, launching a campaign) are **never** retried after a server or network error, because the server may already have done the work, and retrying could send it twice.

`maxRetries` (default `2`) sets how many extra attempts are made. Set it to `0` to turn retries off.

## Cancelling a request

Pass an `AbortSignal` as the last argument:

```js
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

await inboxly.contacts.list({ search: 'asha' }, { signal: controller.signal });
```

For functions whose last argument already holds options, add `signal` alongside them:

```js
await inboxly.messages.sendText('+919876543210', 'Hi', { waNumberId: 'num_123', signal });
```

## TypeScript

Types come with the package, so there's nothing extra to install:

```ts
import Inboxly, { type SendMessageInput, RateLimitError } from 'inboxly';

const inboxly = new Inboxly({ apiKey: process.env.INBOXLY_API_KEY! });

const message: SendMessageInput = { type: 'text', to: '+919876543210', body: 'Hi' };
await inboxly.messages.send(message);
```

## Security

- **Keep API keys on your server.** Never put one in browser or mobile app code, where anyone can read it.
- Give each key **only the scopes it needs**. A reporting script needs only `:read` scopes.
- Store keys in environment variables or a secrets manager, not in your code.
- If a key leaks, revoke it under **Channels & API → API Keys** and create a new one.

## How it works

This library is a thin client. Each function makes one HTTPS request to the Inboxly public API (`/api/v1/public/...`) with your key in the `x-api-key` header. All the real work happens on the Inboxly server, which enforces scopes, rate limits, validation and wallet charges for every call. The package contains no server code or secrets.

## License

MIT
