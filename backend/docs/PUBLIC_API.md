# Inboxly Public API

The Inboxly Public API lets your own systems work with a workspace using an API key:
send WhatsApp messages, reply in inbox conversations, manage templates, WhatsApp
and email campaigns, contacts, segments and opt-outs, read analytics, and receive
events through a webhook. A separate **Authentication (OTP) API** sends
and verifies one-time passcodes over WhatsApp.

Everything here is source-of-truth for `src/routes/public.routes.js` and
`src/authentication/authentication.routes.js`.

---

## Authentication

Every request carries an API key in the `x-api-key` header:

```http
x-api-key: cfp_xxxxxxxxxxxxxxxxx
```

API keys are created, rotated and revoked by a **workspace admin** in
*Settings → API Keys* (or by connecting an application through Inboxly's OAuth
consent screen, which also requires an admin). The raw key is shown once, at
creation or rotation.

A key is refused when:

| Status | When |
|---|---|
| `401` | the header is missing, or the key is unknown or revoked |
| `403` `{ "suspended": true }` | the workspace has been suspended |
| `403` `{ "code": "SUBSCRIPTION_INACTIVE" }` | the workspace's subscription is `CANCELLED` or `EXPIRED` (`PAST_DUE` keeps working during the grace period) |
| `403` `{ "code": "INSUFFICIENT_SCOPE" }` | the key does not hold the scope the endpoint needs |

### Scopes

Each key carries a list of scopes; an endpoint answers `403 INSUFFICIENT_SCOPE`
(naming `requiredScope` and `grantedScopes`) when the key lacks its scope. Keys
issued before scopes existed keep full access.

| Scope | Allows | In the default set |
|---|---|---|
| `messages:send` | `POST /messages` | yes |
| `numbers:read` | `GET /numbers`, `GET /numbers/:id/health` | yes |
| `conversations:read` | `GET /conversations`, `GET /conversations/:id/messages` | yes |
| `conversations:write` | `POST /conversations`, text and template replies in a conversation | |
| `templates:read` | `GET /templates`, `/templates/:id`, `/templates/library`, `/templates/media/:assetId` | yes |
| `templates:write` | create, update, delete, duplicate, restore, sync from Meta, install from library, upload header media | |
| `campaigns:read` | `GET /campaigns`, `/campaigns/:id`, recipients export, `POST /campaigns/estimate` | yes |
| `campaigns:write` | create, edit, recipients, launch, pause, resume, cancel (launching spends the wallet) | |
| `email-campaigns:read` | `GET /email-campaigns`, `/email-campaigns/:id`, `POST /email-campaigns/preview` | yes |
| `email-campaigns:write` | compose, test-send, create (send or schedule), cancel, delete | |
| `contacts:read` | contacts (list, one, tags, export) and segments | yes |
| `contacts:write` | contacts (create, update, import, delete) and segments | yes |
| `opt-outs:read` | `GET /opt-outs` | yes |
| `opt-outs:write` | `POST /opt-outs`, `DELETE /opt-outs/:id` | |
| `webhooks:write` | `POST /webhooks` | |
| `analytics:read` | `GET /analytics/summary` | yes |
| `wallet:read` | `GET /wallet/balance`, `GET /wallet/summary` | yes |
| `ai-agent:read` | `GET /ai-agent/config` | yes |
| `ai-agent:write` | `POST /ai-agent/query` | yes |
| `automations:read` | `GET /automations` | yes |
| `authentication:send` | the Authentication (OTP) API | never — must be requested explicitly |

### Rate limits

Limits are per API key (not per IP), plus an address-level ceiling in front of key
lookup. Exceeding one returns `429` with a `Retry-After` header and
`{ "error": "...", "retryAfterSeconds": n }`.

| Surface | Limit |
|---|---|
| Any public endpoint | 300 requests / minute per key; 600 / minute per client address |
| `POST /messages` | 60 / minute per key, and 10 / minute to any one recipient number |
| `POST /conversations/:id/messages`, `/template` | shares the `POST /messages` budget per key, and 10 / minute into any one conversation |
| `POST /email-campaigns/test` | 20 / minute per key, and 5 / minute to any one address |
| `POST /templates/media`, `POST /contacts/import` | 60 uploads per 10 minutes per key |
| `POST /authentication/generate` | 30 / minute per key, and 5 per 10 minutes to any one phone number |
| `POST /authentication/verify` | 120 / minute per key, and 20 per 10 minutes for any one phone number |

### Connecting an application (OAuth 2.0 authorization code + PKCE)

A registered application can obtain a scoped API key for a user's workspace
through the standard authorization code flow instead of having the user copy a
key by hand. Applications are registered by the operator
(`node src/scripts/seedOAuthClients.js`); there is no self-service registration.
The endpoints live under `https://<your-deployment>/api/v1/oauth`.

1. Send the user's browser to `GET /oauth/authorize` with `response_type=code`,
   `client_id`, `redirect_uri` (must exactly equal a registered URI), `scope`
   (space-separated), `state`, and the PKCE parameters below.
2. A workspace admin approves on the consent screen and the browser comes back to
   `redirect_uri?code=…&state=…`. The code is single-use and expires after
   2 minutes.
3. Exchange it with `POST /oauth/token` (form-encoded or JSON):
   `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`,
   `client_secret` (confidential clients) and `code_verifier` (when PKCE was used).
   The response is `{ "access_token": "cfp_…", "token_type": "Bearer", "scope": "…" }`;
   send the token as `x-api-key`. It does not expire.
4. `POST /oauth/revoke` with `client_id`, `client_secret` (confidential clients)
   and `token` revokes a key that client was issued.

**PKCE (RFC 7636).** Generate a random `code_verifier` (43–128 characters of
`A-Z a-z 0-9 - . _ ~`) per authorization, and send
`code_challenge=BASE64URL(SHA256(code_verifier))` (no padding) with
`code_challenge_method=S256` to `/oauth/authorize`. Send the `code_verifier` to
`/oauth/token`. Only `S256` is supported; `plain`, or a challenge without a
method, is refused with `invalid_request`.

| Client type | Secret | PKCE |
|---|---|---|
| Public (SPA, mobile, desktop — cannot keep a secret) | none | **required**; authorize without a challenge is refused, and the token request is authenticated by the `code_verifier` alone |
| Confidential (server-side, holds `client_secret`) | required | optional, and recommended; once a challenge is sent, the matching verifier is required |

A `code_verifier` sent for a code issued without a challenge is refused, so PKCE
cannot be stripped from or bolted onto a flow mid-way. A wrong verifier returns
`invalid_grant` without consuming the code.

---

## Base URLs

```text
https://<your-deployment>/api/v1/public           # Public API
https://<your-deployment>/api/v1/authentication   # Authentication (OTP) API
```

---

## Billing

Every message sent through this API — `POST /messages` and every OTP — is billed
exactly like a message sent from the dashboard: it uses one message from the plan's
monthly quota, and once the quota is used, the overage rate for the template's
category (MARKETING / UTILITY / AUTHENTICATION) is charged to the workspace wallet.
Text messages use the plan's flat overage rate. If WhatsApp rejects the send, the
quota or wallet charge is refunded.

When neither quota nor wallet balance is left, the send is refused with
`403 { "code": "QUOTA_AND_WALLET_EXHAUSTED" }`.

Every accepted send is recorded on the recipient's conversation (the contact is
created if needed), so it appears in the Inbox and receives delivery and read
statuses.

---

## Identity

### `GET /me`

No scope required. Returns the workspace the key belongs to and the WhatsApp numbers
it can send from (oldest first — the first one is used when `waNumberId` is omitted).

---

## Messages

### `POST /messages` — scope `messages:send`

Sends an approved template, or a free-form text message.

**Template message**

```json
{
  "type": "template",
  "to": "+919876543210",
  "template": {
    "name": "order_update",
    "language": { "code": "en_US" },
    "variables": ["Priya", "#1042"]
  },
  "waNumberId": "optional — a number id from GET /me"
}
```

- `template.name` must be a template in this workspace that Meta has **APPROVED**;
  `language` narrows the match when the same name exists in several languages
  (a bare string such as `"en_US"` is accepted too).
- `template.variables` fills `{{1}}`, `{{2}}`, … in order. Every placeholder the
  template uses must have a non-empty value, or the request is refused with
  `422 TEMPLATE_VARIABLES_REQUIRED` (`details.requiredVariables` says how many).
- Header media, buttons and carousels are built from the stored template; you do
  not send `components`.

**Text message**

```json
{ "type": "text", "to": "+919876543210", "body": "Your order has shipped." }
```

WhatsApp only accepts free-form text within 24 hours of the customer's last
message. Outside that window the send is refused with
`409 { "code": "OUTSIDE_24H_WINDOW" }` and nothing is charged — send a template
instead.

**Response** — `200` with WhatsApp's response plus the stored message id:

```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "919876543210", "wa_id": "919876543210" }],
  "messages": [{ "id": "wamid.HBgM..." }],
  "messageId": "clx..."
}
```

**Errors**

| Status | Meaning |
|---|---|
| `400` | invalid body (missing `to`, `template` or `body`; unknown `type`) |
| `403` | quota and wallet exhausted, subscription inactive, or the recipient opted out (`RECIPIENT_OPTED_OUT`) |
| `404` | no WhatsApp number / unknown `waNumberId` / template not found |
| `409` | outside the 24-hour window (text) |
| `422` | template not approved, or missing variables |
| `502` | WhatsApp rejected the send (its reason is included) |

---

## WhatsApp numbers

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/numbers` | `numbers:read` | Connected numbers with today's send count (access tokens are never returned) |
| `GET` | `/numbers/:id/health` | `numbers:read` | Connection check for one number |

---

## Conversations (WhatsApp inbox)

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/conversations?page=1&limit=20&search=&contactId=` | `conversations:read` | Inbox threads |
| `POST` | `/conversations` | `conversations:write` | Open (or return the existing) conversation with a contact: `{ "contactId", "waNumberId"? }` |
| `GET` | `/conversations/:id/messages` | `conversations:read` | The thread's messages |
| `POST` | `/conversations/:id/messages` | `conversations:write` | Reply with text: `{ "type": "text", "body": "..." }`. Only inside the 24-hour window |
| `POST` | `/conversations/:id/template` | `conversations:write` | Send an approved template into the thread: `{ "templateId", "variables": ["..."] }`. Works outside the 24-hour window |

Replies sent with a key appear in the Inbox like any other message, with no
agent named as the sender, and are billed like `POST /messages`.

---

## Templates

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/templates` | `templates:read` | List templates |
| `GET` | `/templates/:id` | `templates:read` | One template |
| `POST` | `/templates` | `templates:write` | Create a template and submit it to Meta for review. Body: `name`, `category`, `language`, `components` (Meta's template format) |
| `PUT` | `/templates/:id` | `templates:write` | Edit a template |
| `DELETE` | `/templates/:id` | `templates:write` | Delete a template |
| `POST` | `/templates/:id/duplicate` | `templates:write` | Copy a template into a new draft |
| `POST` | `/templates/:id/restore` | `templates:write` | Restore a deleted template |
| `POST` | `/templates/sync` | `templates:write` | Pull templates and review statuses from Meta |
| `GET` | `/templates/library` | `templates:read` | Ready-made templates |
| `POST` | `/templates/library/:libId/install` | `templates:write` | Install a library template |
| `POST` | `/templates/media` | `templates:write` | Upload a header sample as multipart `file` (image, video or document). Returns the handle for the `HEADER` component |
| `GET` | `/templates/media/:assetId` | `templates:read` | The stored header sample |

---

## WhatsApp campaigns

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/campaigns?page=1&limit=20` | `campaigns:read` | Paginated list |
| `GET` | `/campaigns/:id` | `campaigns:read` | One campaign with its results |
| `POST` | `/campaigns` | `campaigns:write` | Create a draft: `{ "name", "templateId", "numberId", "variableConfig"? }` (see *Per-recipient variables*) |
| `POST` | `/campaigns/:id/recipients` | `campaigns:write` | Add recipients: `{ "contactIds": ["..."] }` (max 10,000) |
| `PUT` | `/campaigns/:id/recipients` | `campaigns:write` | Replace the audience: `{ "contactIds": [...] }` |
| `POST` | `/campaigns/:id/launch` | `campaigns:write` | Launch (or schedule with `{ "scheduledAt": "ISO-8601" }`; optional `retryConfig`). The campaign's cost is charged to the wallet at launch |
| `POST` | `/campaigns/estimate` | `campaigns:read` | Price a send before launching: `{ "campaignId" }` or `{ "contactIds": [...], "templateId" }`. Charges nothing |
| `PATCH` | `/campaigns/:id` | `campaigns:write` | Edit a draft or scheduled campaign |
| `POST` | `/campaigns/:id/pause` | `campaigns:write` | Pause a running campaign |
| `POST` | `/campaigns/:id/resume` | `campaigns:write` | Resume a paused campaign |
| `POST` | `/campaigns/:id/cancel` | `campaigns:write` | Cancel the campaign |
| `GET` | `/campaigns/:id/recipients/export` | `campaigns:read` | Per-recipient results as CSV |
| `POST` | `/campaigns/audience-import` | `campaigns:write` | Upload a CSV (multipart `file`) of recipients with a column per variable; creates or matches contacts and returns `{ columns, contacts, values }` |
| `PUT` | `/campaigns/:id/recipient-values` | `campaigns:write` | Save each recipient's row: `{ "values": { "<contactId>": { "<column>": "..." } }, "replace"? }`, up to 2,000 per request |

### Per-recipient variables

By default `{{1}}` is the contact's name and `{{2}}` onwards are the template's
approval samples, the same for everyone. To give each person their own value:

1. `POST /campaigns/audience-import` with a CSV such as
   `phoneNumber,name,cart_item`.
2. Create the campaign with a `variableConfig` naming the column for each variable:

   ```json
   {
     "columns": ["cart_item"],
     "map": {
       "BODY:1": { "source": "name" },
       "BODY:2": { "source": "column", "column": "cart_item" },
       "BODY:3": { "source": "text", "value": "15%" }
     }
   }
   ```

   Keys are `BODY:n` or `HEADER:n`. Sources: `name`, `column` (per person),
   `text` (same for everyone), `sample` (the template's sample). A variable with
   no rule keeps the default.
3. `PUT /campaigns/:id/recipients` with the returned contact ids, then
   `PUT /campaigns/:id/recipient-values` with the returned `values`.

Recipients with an empty value in a mapped column are skipped at launch and not
charged. `POST /campaigns/estimate` reports them as `missingValueContacts`.

---

## Email campaigns

Emails go out through the server's SMTP account and are not billed per message.
Contacts who have opted out are skipped and reported as such.

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/email-campaigns` | `email-campaigns:read` | List email campaigns |
| `GET` | `/email-campaigns/:id` | `email-campaigns:read` | One campaign with its recipients and their status |
| `POST` | `/email-campaigns/compose` | `email-campaigns:write` | AI rewrite of a plain message into structured content: `{ "message", "tone"?, "subject"? }` with `tone` one of `friendly`, `professional`, `promotional`, `short`. Sends nothing |
| `POST` | `/email-campaigns/preview` | `email-campaigns:read` | Rendered HTML of a draft: `{ "message", "content"?, "accentColor"?, "preheader"? }`. Sends nothing |
| `POST` | `/email-campaigns/test` | `email-campaigns:write` | Send one test email: the draft fields plus `{ "to", "subject" }` |
| `POST` | `/email-campaigns` | `email-campaigns:write` | Create and send, or schedule with `scheduledAt` (up to 90 days ahead). See below |
| `POST` | `/email-campaigns/:id/cancel` | `email-campaigns:write` | Stop a scheduled or sending campaign |
| `DELETE` | `/email-campaigns/:id` | `email-campaigns:write` | Delete a campaign |

**Create body**

```json
{
  "name": "Diwali offers",
  "subject": "20% off everything this week",
  "preheader": "Ends Sunday",
  "message": "Plain-text version of the email",
  "content": {
    "headline": "Diwali sale",
    "paragraphs": ["..."],
    "bullets": ["..."],
    "ctaText": "Shop now",
    "ctaUrl": "https://example.com/sale",
    "signoff": "Team Example"
  },
  "accentColor": "#0d9488",
  "scheduledAt": "2026-10-20T09:00:00+05:30",
  "recipients": [{ "email": "priya@example.com", "name": "Priya", "contactId": "optional" }]
}
```

`content` is optional: without it, `message` is laid out as paragraphs. The output
of `/compose` can be passed in as `content`. At most 2,000 recipients per campaign.

---

## Contacts

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/contacts?page=1&limit=20` | `contacts:read` | Paginated list |
| `GET` | `/contacts/:id` | `contacts:read` | One contact |
| `GET` | `/contacts/tags` | `contacts:read` | Every tag in use |
| `GET` | `/contacts/export` | `contacts:read` | All contacts as CSV |
| `POST` | `/contacts` | `contacts:write` | `{ "name", "phoneNumber"?, "email"? }`: a name and at least one of phone or email |
| `POST` | `/contacts/import` | `contacts:write` | Bulk import a CSV as multipart `file` (max 10 MB) |
| `PUT` / `PATCH` | `/contacts/:id` | `contacts:write` | Update fields of a contact |
| `DELETE` | `/contacts/:id` | `contacts:write` | Delete a contact |

### Segments

Saved audiences to target with campaigns.

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/segments` | `contacts:read` | List segments |
| `POST` | `/segments` | `contacts:write` | `{ "name", "desc"? }` |
| `PATCH` | `/segments/:id` | `contacts:write` | Rename or change the description |
| `DELETE` | `/segments/:id` | `contacts:write` | Delete the segment |
| `POST` | `/segments/:id/contacts` | `contacts:write` | Add `{ "contactId" }`, or contact fields to create a contact in the segment |
| `DELETE` | `/segments/:id/contacts/:contactId` | `contacts:write` | Remove a contact from the segment |

---

## Opt-outs

Numbers on this list are not messaged: sends to them fail with `RECIPIENT_OPTED_OUT`.

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/opt-outs?status=&search=&page=1&limit=50` | `opt-outs:read` | Opted-out and blocked numbers |
| `POST` | `/opt-outs` | `opt-outs:write` | Block a number: `{ "phoneNumber", "reason"? }` |
| `DELETE` | `/opt-outs/:id` | `opt-outs:write` | Unblock |

---

## Analytics, wallet, AI agent, automations

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/analytics/summary` | `analytics:read` | Workspace overview metrics |
| `GET` | `/wallet/balance` | `wallet:read` | Wallet balance and recent transactions |
| `GET` | `/wallet/summary` | `wallet:read` | Spend today, campaign and total spend, and recharges |
| `GET` | `/ai-agent/config` | `ai-agent:read` | AI agent persona and settings |
| `POST` | `/ai-agent/query` | `ai-agent:write` | `{ "message": "..." }` → the agent's reply (nothing is sent on WhatsApp) |
| `GET` | `/automations` | `automations:read` | Active automations |

---

## Webhooks

### `POST /webhooks` — scope `webhooks:write`

Sets the URL Inboxly POSTs workspace events to, and optionally which events.

```json
{
  "webhookUrl": "https://your-system.example.com/inboxly-events",
  "webhookEvents": ["messages", "deliveries"]
}
```

`webhookUrl` must be an `http(s)` URL that resolves to a **public** address —
private, loopback, link-local and cloud-metadata addresses are refused with `400`.
Send `""` to remove the webhook. The response is the workspace's webhook settings,
including `webhookVerifyToken`, the secret deliveries are signed with (generated
automatically when a URL is first set).

**Deliveries**

```http
POST <webhookUrl>
Content-Type: application/json
X-Inboxly-Event: message.received
X-Inboxly-Delivery: 6f1c...            # same id on every retry of one event
X-Inboxly-Signature-256: sha256=<hex HMAC-SHA256 of the raw body, keyed with webhookVerifyToken>

{ "id": "6f1c...", "event": "message.received", "workspaceId": "...", "sentAt": "...", "data": { ... } }
```

Events: `message.received`, `message.status`, `campaign.completed`,
`template.status`, `contact.created`, `optout.created`, `custom.event`.

`webhookEvents` is optional. Omitted or empty means every event. Otherwise it is a
list of categories: `messages`, `reactions` and `referrals` select
`message.received`; `deliveries` and `reads` select `message.status`. Other events
are only delivered when no selection is set.

A `2xx` acknowledges the event. Network errors, timeouts (10 s), `408`, `429` and
`5xx` are retried after 2 s, 10 s, 1 min and 5 min (five attempts in all); any other
`4xx` is not retried. Redirects are not followed. Use `X-Inboxly-Delivery` to
discard duplicates.

---

## Authentication (OTP) API

Base URL `/api/v1/authentication`. Requires a key with the `authentication:send`
scope — the workspace's dedicated Authentication key, provisioned by an admin under
*Authentication → API Key*. Which approved **AUTHENTICATION / COPY_CODE** template
and which WhatsApp number are used is set in the workspace's Authentication
configuration; the caller only supplies the phone number.

### `POST /authentication/generate`

```json
{ "to": "+919876543210" }
```

Inboxly generates a 6-digit code, sends it through the configured template and
stores only its hash. The code is never returned to the caller. Each OTP is a
billed AUTHENTICATION-category message (see *Billing*).

```json
{
  "status": "SENT",
  "phone": "919876543210",
  "templateName": "login_code",
  "expiresAt": "2026-10-02T10:10:00.000Z",
  "expiresIn": 600,
  "metaMessageId": "wamid...",
  "mode": "CHATFLOW_GENERATED"
}
```

Errors: `400` invalid phone, `403` quota/wallet, subscription or recipient opted out,
`409` Authentication not configured or disabled, `422` template is not a COPY_CODE
authentication template, `429` rate limit, `502` WhatsApp rejected the send.

### `POST /authentication/verify`

```json
{ "phone": "+919876543210", "code": "123456" }
```

Returns `{ "verified": true, "transactionId": "..." }` or `{ "verified": false, "reason": "..." }` with
`reason` one of `OTP_NOT_FOUND`, `OTP_EXPIRED`, `OTP_ALREADY_USED`, `INVALID_OTP`,
`MAX_ATTEMPTS_EXCEEDED`. Codes expire after 10 minutes and allow 5 attempts.

---

## Errors

Error bodies have the shape:

```json
{ "error": "Human-readable description", "code": "OPTIONAL_MACHINE_CODE" }
```

`400` validation errors also carry `details` (field → messages). Unexpected server
errors return `500` with a `reference` to quote to support.
