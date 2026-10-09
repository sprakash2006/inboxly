# Inboxly — Backend

Node.js + Express 5 + Prisma (PostgreSQL) + BullMQ (Redis) API for Inboxly.
Setup for the whole project is in the root [README](../README.md); this file
covers the backend only.

## Quick start

```bash
npm install                                    # also generates the Prisma client
cp .env.example .env                           # then fill in the values
node scripts/prisma-cli.js migrate deploy      # creates the tables
npm run dev                                    # http://localhost:4000
```

Check it is up: `GET http://localhost:4000/api/v1/health` returns `{"status":"ok"}`.

On first boot the server creates the FREE, BASIC and GROWTH plans. Optional
sample data, for a **local** database only (the scripts refuse a hosted one):

```bash
node --env-file=.env scripts/create-test-user.js   # test@example.com / password123
node --env-file=.env scripts/seed-crm.js           # sample contacts, leads, deals, tasks
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and workers, restarting on file changes |
| `npm start` | Production start (`node src/server.js`) |
| `npm run start:worker` | Background workers only, no HTTP server |
| `npm test` | Unit tests |
| `node scripts/prisma-cli.js migrate deploy` | Apply database migrations |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Folder layout

```
src/
├── server.js        Boot: database, settings, HTTP, then workers and recovery jobs
├── worker.js        Same boot without the HTTP server
├── app.js           Express app: security headers, CORS, webhook raw body, /api/v1, errors
├── config/env.js    Environment variables, validated with Zod
├── routes/          Routers; routes/index.js mounts them all under /api/v1
├── controllers/     Request/response handlers
├── services/        Business logic and Prisma queries
├── validators/      Zod schemas for request bodies
├── middleware/      authenticate, workspaceContext, authorize, rateLimit, errorHandler, ...
├── authentication/  WhatsApp OTP authentication API
├── queues/          BullMQ queue definitions
├── workers/         One worker per queue
└── lib/             prisma, redis, meta (WhatsApp Graph API), mailer, encryption, llm, storage
```

## API

Every route is under `/api/v1`. Workspace routes are under
`/api/v1/workspaces/:workspaceId/...` and pass through `authenticate`
(valid JWT) and `workspaceContext` (membership, suspension, role) before any
handler. Writes add `authorize('CLIENT')` or `authorize('ADMIN')`.

| Area | Routes |
| --- | --- |
| Auth | `/auth` (register with email code, login, refresh, logout, password reset, Google) |
| Messaging | `/whatsapp`, `/templates`, `/campaigns`, `/conversations`, `/contacts`, `/clusters`, `/segments`, `/opt-outs` |
| CRM | `/leads`, `/deals`, `/tasks`, `/activities`, `/crm-analytics` |
| Automation | `/automation`, `/workflows`, `/intents`, `/ai-agents`, `/ai` |
| Workspace | `/settings`, `/members`, `/invitations`, `/analytics`, `/notifications` |
| Webhooks | `/webhook/meta` (WhatsApp messages and delivery receipts) |

## Background workers

Started by `npm run dev` / `npm start` (when `RUN_WORKERS` is not `false`):

| Queue | Worker | Purpose |
| --- | --- | --- |
| `campaigns` | `campaign.worker.js` | Sends campaigns, retries failures, settles charges |
| `emails` | `email.worker.js` | Verification, invite and notification emails |
| `webhooks` | `webhook.worker.js` | Processes incoming WhatsApp events in order |
| `workflows` | `workflow.worker.js` | Runs workflows and resumes them after delays |
| `outgoing-webhooks` | `outgoingWebhook.worker.js` | Delivers events to a workspace's own webhook URL |
| `billing` | `billing.worker.js` | Daily plan renewals |
| `agent` | `agent.worker.js` | Autonomous CRM agent |

## Tests

```bash
npm test
```

`tests/setup.mjs` loads `backend/.env.test` (git-ignored) in place of `.env`,
then refuses to run unless the database URL is local, so tests can never touch
Supabase. Tests that need a real database skip themselves when none is running.
