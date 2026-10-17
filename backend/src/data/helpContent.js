// User-facing help content: what each screen is for and how to get something
// done. This is the "how do I…" half of the assistant's knowledge; the
// marketing half lives in siteContent.js.
//
// These are documents, not answers. The assistant retrieves the relevant ones
// and writes a reply from them, so a guide should describe the real flow in
// plain prose and never try to anticipate a question's phrasing.
//
// One document per task, not per screen. "How do I import contacts" and "how
// do I build a cluster" are different questions with different answers, and a
// single Contacts page dumped into one chunk retrieves for both equally badly.
// Splitting by task is what lets retrieval return the steps someone asked for
// instead of the page they live on.
//
// Every step below was written against the actual UI — the wizard step titles
// in CreateCampaign.jsx, the sidebar labels in Dashboard.jsx, SettingsView.jsx,
// PaymentsView.jsx, WidgetsView.jsx and the rest, down to the field labels.
// When a screen changes, the guide for it has to change too, or the assistant
// will confidently walk someone through a button that no longer exists.
//
// The Inbox, Automation, CRM (leads, deals, tasks), the AI agent studio, Chat
// Analysis and User Analytics are hidden from the app, so no guide describes
// them; one document says plainly that they are not available.
//
// Nothing here states a price or a plan limit: those come from the Plan table
// at index time (see siteKnowledge.service.js), so they cannot go stale.

export const HELP_DOCS = [
  // ─── orientation ───────────────────────────────────────────────────────────
  {
    id: 'getting-started',
    title: 'Getting started with Inboxly',
    topic: 'Onboarding',
    body: `Sign up with an email address and password and verify the email. New accounts must create or join a workspace before the dashboard opens — a workspace is the container for everything you do, and it owns its own WhatsApp numbers, contacts, campaigns, templates, wallet and team.

If a colleague has invited you, open the invitation link and accept it; you will join their workspace instead of creating your own. You can belong to more than one workspace and switch between them from the dashboard.

The usual first run, in order: connect a WhatsApp number under Number Setup, create a message template and get it approved by Meta, add your contacts, top up the wallet under Payments, then build and launch a campaign. New workspaces start on the Free plan, which needs no card. Every message is paid from the wallet, so a workspace needs a wallet balance before it can send anything.`,
  },

  {
    id: 'dashboard-navigation',
    title: 'What is in the dashboard sidebar',
    topic: 'Onboarding',
    body: `The dashboard sidebar is grouped into sections:

Workspace — Home, Contacts and Contact Lists.
Messaging — Campaigns (WhatsApp and email), Templates, Authentication (WhatsApp OTP) and Campaign AI.
Analytics — Analytics.
Channels & API — Number Setup, Website Widget and API Keys.
Account — Payments and Settings.
Help — Resource Center, API Documentation and Help & Support. Legal sits at the bottom of the sidebar.

On a phone the bottom bar has Home, Campaigns, Contacts and Analytics, and the rest is in the menu.`,
  },

  {
    id: 'not-available',
    title: 'Features that are not available',
    topic: 'Onboarding',
    body: `Some features you may have read about are not part of Inboxly any more and have no screen in the dashboard: the shared team Inbox for chatting with customers, the Automation screen (welcome and away messages, keyword auto-replies, workflows, WhatsApp forms, Voice AI calls and Instagram quickflows), the CRM (leads, deals, tasks and the CRM overview), the AI agent studio and autonomous CRM agent, Chat Analysis and User Analytics, and the Integrations page.

What remains for AI is Campaign AI — the agent that answers customers who tap a campaign's button — and the Website Widget's AI assistant on your own site.

If you need something these used to do, raise a ticket under Help & Support and describe what you are trying to achieve.`,
  },

  {
    id: 'dashboard-home',
    title: 'The dashboard home screen',
    topic: 'Onboarding',
    body: `Home is the workspace summary. Tiles show the number of contacts, active campaigns (and the total run) and WhatsApp numbers; each tile opens the screen it counts. A suggested next step — connect a number, finish a draft campaign, create a campaign — appears at the top when there is one, and Later dismisses it.

Home also shows the connected WhatsApp number with its status and quality rating, and an AI prompt box where you can describe what you want, such as a template for an abandoned cart, and have it drafted for you.

A low or empty wallet balance is flagged across the dashboard; top up under Payments, because no message can be sent without balance to pay for it.`,
  },

  // ─── campaigns ─────────────────────────────────────────────────────────────
  {
    id: 'create-campaign',
    title: 'How to create and launch a WhatsApp campaign',
    topic: 'Campaigns',
    body: `Campaigns send an approved WhatsApp template to a list of contacts. Open Campaigns in the sidebar, choose to create a campaign, and pick WhatsApp as the channel. Name the campaign at the top of the builder. Steps 1 to 4 are required; the others are optional.

Goal: optionally say what the campaign is for.

Step 1, Campaign Type & WhatsApp Number: pick which of your connected numbers it sends from.

Step 2, Message Template: choose an approved template. Only templates Meta has approved can be sent. If the template has variables, set how each one is filled per contact — from a contact field or a column of your upload.

Step 3, Audience: choose who receives it — Select from List (pick contacts), Select Cluster, Select Segment (a Contact List), Upload CSV, or Enter Manually. Numbers that have opted out or are blocked are removed here and are never charged for.

Step 4, Schedule: send immediately, or set a date and time to send later.

Step 5, AI Agent: attach your deployed Campaign AI agent and label its button. The agent answers questions about this specific campaign from a snapshot of what the campaign said.

Step 7, Retries: retry failed sends on a schedule you choose.

Step 9, Fallback Channels: send over SMS or email to recipients WhatsApp could not reach. Retries and fallbacks cannot both be on for one campaign — turn retries off first.

Review & launch shows the cost and any warnings. Save as a draft at any point, or launch when the required steps are done.`,
  },

  {
    id: 'campaign-list',
    title: 'Finding your campaigns and their reports',
    topic: 'Campaigns',
    body: `Campaigns in the sidebar lists every WhatsApp campaign in the workspace, newest first, including campaigns sent with an Authentication (OTP) template. Search by campaign name, status or template name from the search box. Email campaigns have their own tab on the same screen.

Each row shows the status, sent, delivered, read, failed, retries, skipped, cost and delivery rate. Open a campaign to see its full report, and export the recipient list as a CSV from there.

Delivered and read counts are reported by Meta after sending, so they can keep rising for a while after a campaign shows as complete.`,
  },

  {
    id: 'campaign-statuses',
    title: 'Campaign statuses and what happens after launch',
    topic: 'Campaigns',
    body: `A campaign starts as a draft. Launching moves it to running, and it completes when every recipient has been attempted. A scheduled campaign waits until its send time and then runs on its own — the schedule survives a server restart.

While it runs, the campaign tracks counts per recipient: sent, delivered, read, failed and skipped. Skipped is counted separately from failed on purpose: a blocked or opted-out number is not a delivery error and never stops the rest of the campaign.

When the campaign completes, billing settles and the cost of anything that was not sent is refunded to the wallet.`,
  },

  {
    id: 'campaign-retries',
    title: 'Retries and fallback channels on a campaign',
    topic: 'Campaigns',
    body: `Step 7 of the campaign builder turns on retries. A retryable failure is attempted again on a schedule you configure rather than being written off on the first error. Permanent failures — an invalid number, a rejected template, a blocked recipient — are not retried, because repeating them cannot succeed.

A recipient is billed once no matter how many attempts it took, so retries never double-charge.

Step 9 configures fallback channels: when WhatsApp cannot reach a recipient, the message can go out over SMS or email instead. Retries and fallbacks are mutually exclusive on one campaign — the builder blocks fallbacks while retries are on, so turn retries off first.`,
  },

  {
    id: 'email-campaigns',
    title: 'How to send an email campaign',
    topic: 'Campaigns',
    body: `Email campaigns are created from Campaigns: start a new campaign and choose Email as the channel.

Write the subject line and the message. AI can rewrite the copy in the tone you choose — use Rewrite again for another version — and the live preview shows the email as it will arrive. Pick a colour theme and optional preview text.

Recipients can come from your contacts (all, or filtered by tag or a contact list), from an imported CSV, or typed in as email addresses. Send a test to yourself first, then Send now or schedule it for later. A running email campaign can be stopped.`,
  },

  // ─── billing ───────────────────────────────────────────────────────────────
  {
    id: 'message-billing',
    title: 'How messages are charged — every message uses the wallet',
    topic: 'Billing',
    body: `Every WhatsApp message Inboxly sends is paid from the workspace wallet. That includes campaign messages, template messages, media, OTP messages and messages sent through the public API. The plan's included message count no longer makes any message free; it only counts how many messages were used this cycle.

Before a message is sent, its price is taken from the wallet. If the balance cannot cover it, the send is refused with an "Insufficient wallet balance" error and nothing goes out — the wallet never goes below zero. Recharge the wallet under Payments and send again.

If WhatsApp rejects a message after it was charged, the money is refunded to the wallet automatically.

The wallet is separate from the plan subscription: the plan is the monthly or quarterly platform fee, and the wallet pays for the messages.`,
  },

  {
    id: 'campaign-billing',
    title: 'How campaigns are charged and refunded',
    topic: 'Billing',
    body: `A WhatsApp campaign is charged for every valid recipient at the moment you launch it — the number of recipients multiplied by the per-message rate of the template's category. The cost and your balance before and after are shown in the Review & launch step.

If the wallet does not hold enough to cover the whole campaign, the launch is refused with "Insufficient Wallet Balance. Please recharge your wallet." rather than partly sent. Top up under Payments and launch again.

When the campaign completes, is cancelled or fails, everything that was not actually sent comes back to the wallet as a refund — recipients skipped because they opted out or were blocked, numbers that could not be sent to, and anything that never reached Meta. A recipient is billed once no matter how many attempts it took.

The Transaction History under Payments shows every charge and every refund with its reason.`,
  },

  {
    id: 'message-pricing',
    title: 'What a message costs',
    topic: 'Billing',
    body: `WhatsApp charges per message category, and the category comes from the template. The three categories are Marketing (offers, launches, re-engagement), Utility (order updates, reminders, receipts) and Authentication (one-time passcodes). Choosing the right category matters: an order update filed as Marketing costs more to send.

The published per-category rate card is the same table sends are charged against, so the figure quoted is the figure charged. A plain message with no template, such as a reply, is charged at the plan's flat per-message rate.

Payments, under Paid Messages Insights, breaks message spend down by category.`,
  },

  {
    id: 'wallet-recharge',
    title: 'How to top up the wallet',
    topic: 'Billing',
    body: `Open Payments in the sidebar to see the Total Wallet Balance, then use Recharge Wallet, enter an amount and pay through Razorpay.

The credit lands once the payment is verified on the server — the amount is read back from the payment gateway rather than trusted from the browser, so a failed or tampered payment cannot credit the wallet.

Only workspace administrators can recharge. Other roles can see the balance and the history but not add funds.

Because every message is paid from the wallet, a message that will not send or a campaign that will not launch is usually a wallet that needs topping up.`,
  },

  {
    id: 'wallet-ledger-invoices',
    title: 'Transaction history, invoices and billing details',
    topic: 'Billing',
    body: `Payments has tabs for Wallet, Manage Subscriptions, Invoices, Billing Details, Track Expenses and Paid Messages Insights.

Transaction History lists every movement of the wallet with its type, category and reason: per-message charges, campaign charges, refunds, top-ups and adjustments. A surprising balance can be traced to the thing that caused it.

Invoices for plan subscriptions are downloadable under Invoices. Billing Details holds the Legal Business Name, Business Email, Business Address and GST / Tax Details printed on them.

Messages used this cycle shows how many messages the workspace has sent in the current billing cycle.`,
  },

  {
    id: 'plans-subscription',
    title: 'How to change plan, upgrade or downgrade',
    topic: 'Billing',
    body: `Every workspace is on a plan. The plan sets the limits on team members, contacts, API keys and campaigns, and which features are switched on, such as Campaign AI. Messages themselves are paid from the wallet on every plan. New workspaces start on Free, which needs no card.

Available Plans and the Current Plan are shown under Payments, in Manage Subscriptions. Choose a plan to buy or change to it. Some plans can be billed monthly or quarterly; others are monthly only, which the plan card says.

Changing plan is an administrator action — other roles see a prompt to ask a workspace admin.

An upgrade or downgrade is applied at the next billing cycle rather than prorated mid-cycle, and cancelling ends the subscription at the period end rather than immediately.

Enterprise is not sold self-serve; it is arranged through Talk to sales.`,
  },

  // ─── contacts ──────────────────────────────────────────────────────────────
  {
    id: 'contacts-add',
    title: 'How to add contacts and import a CSV',
    topic: 'Contacts',
    body: `Open Contacts in the sidebar. Every contact needs a name and at least a phone number or an email address. To add one by hand, fill in the name, the phone number in full international format (for example +91 9876543210), optionally an email address, and any tags such as vip, newsletter or prospect.

To load a list, use the CSV import: drop a CSV onto the upload area or click to browse for it, and follow the column layout described on the screen — a mismatched header is the usual reason an import brings in fewer rows than expected.

Contacts are searchable by name or phone, and can be filtered by cluster, contact list or tag.

A contact who has opted out or is blocked stays in the list but is skipped and not charged for on every campaign.`,
  },

  {
    id: 'contacts-lists-clusters',
    title: 'Contact Lists, clusters and tags',
    topic: 'Contacts',
    body: `There are three ways to target part of your contacts rather than all of them.

Contact Lists has its own page in the sidebar. Create a list with a name and description, open it, and use Add Customer to put people in it. In the campaign builder a contact list is chosen with Select Segment in the Audience step, and email campaigns can send to one too.

Clusters are built on the Contacts screen with Create Cluster: give it a name (for example "VIP Customers" or "Pune Leads"), an optional description, then select the contacts that belong to it. Choose one with Select Cluster in the Audience step.

Tags are labels on each contact, useful for filtering the list and for email campaign recipients.

Opted-out and blocked numbers are removed from any audience before the campaign is costed.`,
  },

  // ─── templates ─────────────────────────────────────────────────────────────
  {
    id: 'templates-create',
    title: 'How to create a message template',
    topic: 'Templates',
    body: `WhatsApp requires that any message that starts a conversation uses a template Meta approved in advance. Templates live under Templates in the sidebar, with your own templates and a starter Library you can copy from.

To build one: give it a name, pick a language, and choose a category. Marketing is for promotions and announcements, Utility for order updates, confirmations and alerts, Authentication for one-time passwords only. The category also sets what each send costs.

Then assemble the message: an optional header (text or an image), the body, an optional footer, and optional buttons. Numbered variables in the body are filled per recipient at send time.

AI can draft the body copy and generate the header image for you, or you can write and upload your own. Submit the finished template to Meta for review.`,
  },

  {
    id: 'templates-approval',
    title: 'Template approval, statuses and rejections',
    topic: 'Templates',
    body: `A submitted template is reviewed by Meta, not by Inboxly, and approval is not instant. A template is pending until Meta rules on it, then approved or rejected. Use Sync on the Templates screen to pull the latest statuses from Meta.

Only approved templates can be selected in a campaign, which is why the template step of the campaign builder shows nothing until at least one is approved.

If a template is rejected, change what Meta objected to and submit it again. Marketing copy in a Utility template, or variables with no explaining text around them, are the common causes.`,
  },

  // ─── authentication / OTP ──────────────────────────────────────────────────
  {
    id: 'authentication-otp',
    title: 'Sending WhatsApp OTPs with Authentication',
    topic: 'Authentication',
    body: `Authentication in the sidebar is for one-time passcodes sent over WhatsApp. It has Overview, Templates and Analytics tabs.

Create an Authentication-category template under the Templates tab and get it approved. Your own app then requests codes through the public API using an API key, and Inboxly sends the code on WhatsApp and checks it when the user enters it.

Overview and Analytics show the verification journey — requests, delivered, verified, expired and failed — filterable by source, status, template and date range. OTP Expiration sets how long a code stays valid.

Each OTP message is charged from the wallet at the Authentication rate, like any other message.`,
  },

  // ─── Campaign AI ───────────────────────────────────────────────────────────
  {
    id: 'campaign-ai-setup',
    title: 'How to set up and deploy the Campaign AI agent',
    topic: 'Campaign AI',
    body: `Campaign AI in the sidebar is where you set up the agent that answers customers who tap a campaign's button. The screen is organised into sections: Identity (name, persona and tone, languages), Purpose (what the agent is for), Knowledge (notes and documents it answers from), Instructions (how it should answer), Campaign awareness (which campaigns use it), Escalation (when it steps back for a person), Safety (your own guardrails) and Performance (what is still missing before it is ready).

Use the Test lab to ask it questions before going live, optionally against a specific campaign's content. Deploy it when it is ready; deploying is refused when the instructions are too short or no AI provider is configured.

Then attach it to a campaign in step 5 (AI Agent) of the campaign builder. Attaching an agent needs a plan that includes Campaign AI.

The agent answers only from the campaign the customer received and your knowledge. Asked something neither covers, it says it does not have that rather than inventing an answer. Escalation rules — refund or complaint intent, negative sentiment, a customer asking for a human, and optionally high purchase intent — make it step back so your team can take over.`,
  },

  // ─── website widget ────────────────────────────────────────────────────────
  {
    id: 'website-widget',
    title: 'How to add the chat widget to your website',
    topic: 'Website Widget',
    body: `Website Widget in the sidebar creates a chat widget for your own website. Create a widget, choose its mode — AI Assistant, WhatsApp, or AI + WhatsApp — and set its look and the domains it may run on. Copy the embed code into your site.

In AI mode the widget answers visitors from the knowledge you upload on the same screen, such as your FAQs and policies. In WhatsApp mode it hands the visitor over to a chat with your WhatsApp number; AI + WhatsApp does both.

Lead capture can ask visitors for their Name, Phone or Email, and a submitted form becomes a contact in Contacts. The screen also shows recent widget sessions and analytics.

Managing widgets needs an Admin or Member role.`,
  },

  // ─── number setup ──────────────────────────────────────────────────────────
  {
    id: 'number-setup',
    title: 'How to connect a WhatsApp number',
    topic: 'Setup',
    body: `Open Number Setup in the sidebar. There are three routes to a working WhatsApp Business API number.

Connect via Meta is the recommended one: you go through Meta's embedded signup and authorise Inboxly against your own WhatsApp Business account, and the number is bound to your workspace at the end of it.

Connect Your Own is the manual version, for a number already set up on the API elsewhere. It asks for the number's access token (the long value beginning EAA…).

Get a Number claims one from the platform's number pool, when you do not have your own. Pool numbers are assigned by an administrator.

The number, its templates and its access token belong to your workspace, and access tokens are encrypted at rest. The screen also shows the number's quality rating from Meta; a falling rating can get a number's sending limits cut, usually because of marketing to people who did not expect it.`,
  },

  // ─── compliance ────────────────────────────────────────────────────────────
  {
    id: 'opt-outs',
    title: 'Opt-outs and blocked numbers',
    topic: 'Compliance',
    body: `A number that has opted out or been blocked is skipped by every future campaign and removed from the cost before your wallet is charged.

Review and manage the list under Settings, in Blocked Numbers. Blocking a number there has the same effect as the customer opting out.

Settings can also send a High Opt-out Alert, which is worth leaving on: a spike in opt-outs is the earliest warning that a campaign's targeting or frequency is wrong, and it damages the number's quality rating with Meta if it continues.`,
  },

  // ─── analytics ─────────────────────────────────────────────────────────────
  {
    id: 'analytics',
    title: 'Analytics and reporting',
    topic: 'Analytics',
    body: `Analytics reports delivery and spend: sent, delivered, read and failed per campaign, tied back to what the campaign cost. Retries and SMS or email fallback are included, so a campaign's real reach is visible rather than just its first attempt.

Each campaign's own report is opened from the Campaigns list. Payments shows the message-spend breakdown by category under Paid Messages Insights, and Authentication has its own OTP analytics.

Delivered and read counts are reported by Meta after sending, so they continue to rise for a while after a campaign shows as complete.`,
  },

  // ─── team and settings ─────────────────────────────────────────────────────
  {
    id: 'team-members',
    title: 'How to invite team members and manage roles',
    topic: 'Team',
    body: `Team is a tab under Settings. Invite a colleague by email, or create an invite link that anyone can use to join as an Admin or a Member. Someone without an account yet signs up through the same link and joins on the way in. Invitations not yet accepted appear under Pending Invitations.

Roles decide what members can do. Admin has full access, including billing, the wallet and members. Member runs the workspace day to day — campaigns, templates, numbers, the widget, API keys — but cannot spend money or manage members. Agent works on contacts and cannot run campaigns or change settings. Viewer is read-only. The role is re-checked on every request, so a change takes effect immediately.

How many members a workspace can hold depends on its plan.`,
  },

  {
    id: 'settings-notifications',
    title: 'Settings, notifications and workspace configuration',
    topic: 'Settings',
    body: `Settings has tabs for Workspace, Team, Notifications, Branding, Security and Billing.

Workspace holds the business name, industry, time zone and default phone country. Branding sets the logo and accent colour. Security covers sign-in and sessions.

Notifications can be switched on per event, in-app and by email: Campaign Completed, Template Approved, Template Rejected, Member Invited, High Opt-out Alert and Rate Limit Warning.

Settings also holds the outbound webhook URL and verify token, a count of messages sent today, and Blocked Numbers.`,
  },

  // ─── developers ────────────────────────────────────────────────────────────
  {
    id: 'api-keys',
    title: 'How to create an API key and use the public API',
    topic: 'Developers',
    body: `API Keys in the sidebar issues keys for the public API. Create one with an optional name to tell it apart from the others.

The key is shown once, at creation. Copy it then and store it safely — it is stored hashed and cannot be read back. If a key is lost or leaked, rotate it for a new value or revoke it.

A key is scoped to the workspace that created it, and how many keys a workspace can hold depends on its plan. The public API can send messages and OTPs, list and create templates, list, create and launch campaigns, list, create and update contacts, and register a webhook URL. Every message sent through the API is charged from the wallet, and a send the wallet cannot cover is refused with a 403 error.

API Documentation in the sidebar describes every endpoint, and the API Playground on the API Keys screen sends a real test request without writing code.`,
  },

  {
    id: 'webhooks',
    title: 'How to set up webhooks',
    topic: 'Developers',
    body: `Webhooks push events to your own server rather than making you poll for them. Set the webhook URL — an HTTPS endpoint you control — and a verify token under Settings or the API Keys screen, and choose which events to subscribe to.

Your endpoint should answer quickly and do its real work afterwards; a slow endpoint causes deliveries to be treated as failures.

This is different from Meta's own webhook, which Inboxly uses internally for delivery receipts, template status and customer replies. The webhook configured here forwards events on to your systems.`,
  },

  // ─── support and security ──────────────────────────────────────────────────
  {
    id: 'support',
    title: 'How to get help or contact support',
    topic: 'Support',
    body: `Help & Support in the dashboard sidebar raises a ticket with the Inboxly team. Give it a subject, pick a category and describe the issue. The categories are General, Billing, Technical, Bug report and Feature request.

Tickets are tied to your workspace and the team replies to the account's email address. Your previous requests are listed on the same screen.

The Resource Center has step-by-step guides, and API Documentation covers the public API. For Enterprise — custom volume, SSO and audit logs, custom integrations, an SLA — use Talk to sales on the pricing section of the website.`,
  },

  {
    id: 'security-data',
    title: 'Security, privacy and data handling',
    topic: 'Security',
    body: `Everything is scoped to a workspace: contacts, campaigns, templates and wallet all belong to one, and members reach them only through their membership in it. That boundary lets an agency keep one workspace per client with no leakage between them.

WhatsApp access tokens are encrypted at rest. API keys are stored hashed and shown only once, at creation.

Sign-in is email and password, with the email verified at sign-up. Sessions use short-lived access tokens with refresh tokens behind them, held in secure cookies.

Workspace roles are re-derived from the membership record on every request rather than trusted from the session, so a role change takes effect immediately.`,
  },

  // ─── troubleshooting ───────────────────────────────────────────────────────
  {
    id: 'troubleshooting',
    title: 'Common problems and what causes them',
    topic: 'Troubleshooting',
    body: `"Insufficient wallet balance" when sending a message: every message is paid from the wallet and the balance does not cover this one. Recharge under Payments and send again.

A campaign will not launch: the wallet does not cover the full campaign cost shown in Review & launch. Top up under Payments; launches are refused rather than sent halfway.

No templates appear in the campaign builder: only Meta-approved templates can be sent. Use Sync on the Templates screen to pull the latest approval status.

A campaign is missing from the list: the Campaigns screen lists every WhatsApp campaign, including ones sent with an Authentication template. Clear the search box, and check you are in the right workspace.

The Campaign AI agent will not deploy: its instructions are too short or no AI provider is configured.

Delivered and read counts look low right after a launch: Meta reports them after sending and they keep rising for a while.

Fallback channels cannot be enabled: retries are on. The two are mutually exclusive on one campaign — turn retries off first.

Messages to one contact are not sending: check whether the number is blocked or opted out under Settings, Blocked Numbers.

Looking for the Inbox, Automation, workflows or the CRM: those features are not available in Inboxly any more.`,
  },
];
