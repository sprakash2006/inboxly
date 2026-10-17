# Inboxly

**WhatsApp Business messaging with a built-in sales CRM.**

Inboxly lets a business run WhatsApp campaigns, reply to customers from a shared
inbox, automate common replies, and turn the conversations into leads and deals,
all in one workspace.

> Course project, TY first semester.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Node.js SDK](#nodejs-sdk)
5. [Getting started](#getting-started)
6. [Environment variables](#environment-variables)
7. [Scripts](#scripts)
8. [Testing](#testing)
9. [How it works](#how-it-works)
10. [Acknowledgements](#acknowledgements)

---

## Features

### Messaging
| Feature | What it does |
| --- | --- |
| **Shared inbox** | Two-way WhatsApp chat with customers; notes, assignment, resolve/reopen, media and template replies |
| **24-hour window** | Enforces Meta's customer-service window: free text inside it, approved templates outside it |
| **Templates** | Create WhatsApp message templates, submit them to Meta and sync their approval status |
| **Campaigns** | Bulk-send a template to a contact list, CSV upload or group; schedule, cancel, retry and see delivery reports |
| **Contacts** | Add, import (CSV), tag and group contacts; opt-out (STOP) and blocked-number handling |

### CRM
| Feature | What it does |
| --- | --- |
| **Leads** | Lead list with search and status (New → Contacted → Qualified / Unqualified / Lost), notes and activity |
| **Deals** | Kanban pipeline with drag-and-drop stages, deal values and a stage-history timeline |
| **Tasks** | Follow-up tasks with due dates; pending, overdue and completed views |
| **Convert to deal** | One click turns a qualified lead into a deal |
| **Campaign reply → lead** | A customer who replies to a campaign can become a lead automatically (Settings → Lead capture) |
| **CRM overview** | Pipeline value, win rate, overdue tasks, charts and recent activity |

### Automation and AI
| Feature | What it does |
| --- | --- |
| **Basic automations** | Welcome message, away message and business hours |
| **Keyword replies** | Auto-reply when a message contains a keyword |
| **Workflow builder** | "When this happens, do that" flows: messages, buttons, delays, wait-for-reply, conditions and CRM actions |
| **AI auto-reply agent** | Answers customers on WhatsApp from your business information (Google Gemini) |
| **AI assist** | Suggested inbox replies and AI-drafted templates |

### Workspace and platform
| Feature | What it does |
| --- | --- |
| **Accounts** | Sign-up with email verification, login, password reset, optional Google sign-in |
| **Team** | Invite members with Admin / Member / Agent / Viewer roles |
| **Analytics** | Delivery and read rates, campaign results, chat and audience analytics |
| **Super admin** | Platform owner's view of workspaces, users, plans and activity |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, Recharts (no UI framework; custom components and CSS) |
| Backend | Node.js, Express 5, Zod validation |
| Database | PostgreSQL (hosted on Supabase) with Prisma ORM |
| Queues | Redis (hosted on Upstash) with BullMQ background workers |
| Messaging | Meta WhatsApp Business Cloud API |
| Auth | JWT access + refresh tokens, bcrypt, Google OAuth (Passport) |
| Email | Nodemailer over SMTP (Gmail) |
| AI | Google Gemini |

---

## Project structure

```
inboxly/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        Database schema
│   │   └── migrations/          Migration history (builds an empty database)
│   ├── scripts/                 Prisma helpers and seed scripts
│   ├── tests/                   Test bootstrap
│   └── src/
│       ├── server.js            Boot: database, Redis, HTTP server, workers
│       ├── app.js               Express app and middleware
│       ├── config/env.js        Validated environment variables
│       ├── routes/              API routes, all under /api/v1
│       ├── controllers/         Request handlers
│       ├── services/            Business logic and database queries
│       ├── validators/          Zod request schemas
│       ├── middleware/          Auth, workspace access, roles, rate limiting
│       ├── queues/ workers/     Background jobs (BullMQ)
│       └── lib/                 Meta API client, mailer, encryption, LLM, storage
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.jsx              Routing (public pages, auth, dashboard)
│       ├── pages/               One file per screen (Inbox, Campaigns, Leads, ...)
│       ├── components/          Shared UI components
│       └── lib/                 API client, permissions, helpers
└── sdk/                         `inboxly` npm package: Node.js client for the public API
```

---

## Node.js SDK

The [`sdk/`](sdk) folder is the `inboxly` npm package. Instead of sending HTTP
requests to `/api/v1/public/...` yourself, you call its functions with an API key:

```js
import Inboxly from 'inboxly';

const inboxly = new Inboxly({ apiKey: process.env.INBOXLY_API_KEY }); // uses the hosted server
await inboxly.messages.sendText('+919876543210', 'Hello!');
```

Each function makes one request to the public API, so the server still enforces
scopes, rate limits and billing. The package contains no server code or secrets.
See [sdk/README.md](sdk/README.md) for the full reference.

---

## Getting started

### Prerequisites

- **Node.js 20.19+** (Node 22 recommended)
- A **PostgreSQL** database: a free [Supabase](https://supabase.com) project or a local PostgreSQL
- A **Redis** instance: a free [Upstash](https://upstash.com) database or a local Redis
- A **Meta developer app** with WhatsApp enabled, for sending messages
- A **Gmail app password**, for verification emails

### 1. Install

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

### 2. Configure

Copy the template and fill it in (see [Environment variables](#environment-variables)):

```bash
cd backend
cp .env.example .env
```

Generate each secret (run once per secret):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Create the database tables

```bash
cd backend
node scripts/prisma-cli.js migrate deploy
```

The FREE, BASIC and GROWTH plans are created automatically the first time the
server starts.

### 4. Run

Backend (http://localhost:4000):

```bash
cd backend
npm run dev
```

Frontend (http://localhost:5173), in a second terminal:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 and sign up. The account whose email matches
`ADMIN_EMAIL` becomes the platform super admin.

---

## Environment variables

All variables live in `backend/.env`. [`backend/.env.example`](backend/.env.example)
lists every one with notes; the server refuses to start if a required one is missing.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` locally |
| `DATABASE_URL` | yes | PostgreSQL connection (Supabase **transaction pooler**, port 6543) |
| `DIRECT_URL` | with Supabase | Non-pooled connection for migrations (**session pooler**, port 5432) |
| `REDIS_URL` | yes | Redis connection (`rediss://...` for Upstash) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | Login token signing keys, 32+ characters |
| `ENCRYPTION_KEY` | yes | Encrypts stored credentials; 64 hex characters |
| `ADMIN_EMAIL` | yes | Email of the super-admin account |
| `META_APP_ID`, `META_APP_SECRET`, `META_BUSINESS_ID`, `META_WABA_ID`, `META_SYSTEM_USER_TOKEN` | yes | WhatsApp Cloud API credentials |
| `META_WEBHOOK_VERIFY_TOKEN` | yes | Any random string, also entered in the Meta webhook settings |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google sign-in (placeholders work if you don't use it) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | for sign-up | Sends verification and invite emails |
| `GEMINI_API_KEY` | optional | Enables the AI features |
| `CLIENT_URL`, `APP_URL` | optional | Frontend and backend URLs (default to localhost) |

> **Never commit `backend/.env`.** It is excluded by `.gitignore`.

Note: a database password containing `@` must be written as `%40` inside the URL.

---

## Scripts

### Backend (`backend/`)

| Command | What it does |
| --- | --- |
| `npm run dev` | API and background workers with auto-restart |
| `npm start` | Production start |
| `npm test` | Unit tests |
| `node scripts/prisma-cli.js migrate deploy` | Applies database migrations |
| `npm run db:studio` | Opens Prisma Studio to browse the data |

### Frontend (`frontend/`)

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests |

---

## Testing

```bash
cd backend
npm test
```

Tests never touch the real database. `backend/.env.test` (git-ignored) replaces
`.env` during the run, and a guard refuses to run against any non-local
database. Tests that need a database skip themselves when none is available;
the rest run against mocks.

```bash
cd frontend
npm test
```

```bash
cd sdk
npm test
```

The SDK tests use a fake `fetch`, so they need no running server.

---

## How it works

**Sending a campaign.** The campaign wizard saves a draft, estimates the cost and
launches it. Launch places the job on a BullMQ queue; the campaign worker sends
each message through the WhatsApp Cloud API at a safe rate, records every
recipient's status and retries failures.

**Receiving a message.** Meta calls `POST /api/v1/webhook/meta`. The signature is
verified, the event is queued, and the webhook worker stores the message, opens
the 24-hour reply window and runs, in order: opt-out handling, keyword replies,
workflows and the AI agent. Delivery and read receipts update the message status.

**Lead → deal.** Leads come from the Leads screen or from campaign replies.
Converting a qualified lead creates a deal in the pipeline; every stage move is
recorded in the deal's history and can trigger a workflow.

**Access control.** Every workspace route checks the user's membership and role.
Viewers can only read, agents can work the inbox, members can edit, and admins
manage billing, team and settings.

---

## Acknowledgements

- Built on an existing WhatsApp Business platform codebase, which was
  rebranded, trimmed and reconfigured for this project.
- The autonomous-agent design credits are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
