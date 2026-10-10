// Email campaigns: compose (optionally rewritten by AI), preview, send now or
// later, and track per-recipient results. Mail goes out through the same SMTP
// account as the app's own emails (lib/mailer.js), one recipient at a time
// from a queue worker so a large list never holds an HTTP request open.
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { llmJson } from '../lib/llm.js';
import { sendMail } from '../lib/mailer.js';
import { realtime } from '../lib/realtimeBus.js';
import { enqueueEmailCampaign } from '../queues/emailCampaign.queue.js';
import {
  contentFromMessage, normalizeContent, renderEmailHtml, personalize, personalizeText,
} from '../lib/emailCampaignHtml.js';

export const MAX_RECIPIENTS = 2000;
// Gmail's SMTP limit is roughly 500 a day and it throttles bursts, so sends
// are spaced out rather than fired as fast as the connection allows.
const SEND_GAP_MS = 300;
const BATCH = 25;

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const isEmail = (s) => EMAIL_RE.test(String(s || '').trim());

const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function smtpReady() {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM);
}

async function brandOf(workspaceId) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, brandColor: true, brandLogoUrl: true },
  });
  if (!ws) throw fail(404, 'Workspace not found');
  return ws;
}

const firstSentence = (s) => String(s || '').split(/(?<=[.!?])\s|\n/)[0].trim().slice(0, 78);

// ─── Compose ────────────────────────────────────────────────────────────────

const TONES = {
  friendly: 'warm, friendly and conversational',
  professional: 'clear, polished and professional',
  promotional: 'energetic and persuasive, focused on the offer, without hype or false urgency',
  short: 'brief and to the point; keep it under 80 words',
};

const SYSTEM = `You are an expert email marketing copywriter. You turn a business owner's rough message into a clear, engaging marketing email.
Return ONLY a JSON object with exactly these keys:
{"subject": string (max 70 chars), "preheader": string (max 110 chars, complements the subject), "headline": string (max 70 chars), "paragraphs": string[] (2 to 4 short paragraphs), "bullets": string[] (0 to 5 short benefit or detail lines; empty if the message has no list-like details), "ctaText": string (2 to 4 words, empty if there is no link), "ctaUrl": string, "signoff": string}
Rules:
- Keep every fact from the message: names, offers, prices, dates, codes, links. Never invent discounts, prices, dates, links, statistics or claims.
- ctaUrl must be a link that appears in the message, copied exactly; otherwise "".
- Keep placeholders like {{name}} and {{first_name}} exactly as written. You may open with "Hi {{first_name}}," as the first paragraph.
- Use **double asterisks** for at most two short emphasised phrases. No other markdown, no HTML, no emoji.
- Write in the same language as the message.
- signoff is a closing line plus the business name, e.g. "Warm regards,\\nThe Acme team".`;

// Rewrites a plain message into structured email content with AI. Without a
// configured model (or if it fails) the message is laid out as-is, so the
// feature still works and says why the wording did not change.
export async function compose(workspaceId, { message, tone = 'friendly', subject } = {}) {
  const text = String(message || '').trim();
  if (text.length < 5) throw fail(400, 'Write a message first, then rewrite it.');
  const brand = await brandOf(workspaceId);

  const prompt = `Business name: ${brand.name}
Tone: ${TONES[tone] || TONES.friendly}
${subject ? `Subject the owner suggested (improve it if useful): ${subject}\n` : ''}
Message:
"""
${text.slice(0, 4000)}
"""`;

  const ai = await llmJson(prompt, SYSTEM).catch(() => null);
  if (ai && (ai.headline || ai.paragraphs)) {
    const content = normalizeContent(ai);
    // A link the model made up is dropped: the button must point somewhere
    // the owner actually wrote.
    if (content.ctaUrl && !text.includes(content.ctaUrl.replace(/\/$/, '').replace(/^https?:\/\//, ''))) {
      content.ctaUrl = '';
      content.ctaText = '';
    }
    return {
      aiUsed: true,
      subject: String(ai.subject || subject || content.headline).slice(0, 150),
      preheader: String(ai.preheader || '').slice(0, 160),
      content,
    };
  }

  const content = contentFromMessage(text);
  return {
    aiUsed: false,
    notice: 'AI is not configured on this server (GEMINI_API_KEY), so your message was laid out as written instead of rewritten.',
    subject: subject || content.headline || firstSentence(text),
    preheader: '',
    content,
  };
}

// The exact HTML a recipient will get, with sample values in the placeholders.
export async function preview(workspaceId, { message, content, accentColor, preheader } = {}) {
  const brand = await brandOf(workspaceId);
  const body = content ? normalizeContent(content) : contentFromMessage(message);
  const html = renderEmailHtml({
    content: body, accentColor: accentColor || brand.brandColor, preheader,
    brandName: brand.name, logoUrl: brand.brandLogoUrl,
  });
  return {
    html: personalize(html, { name: 'Priya Sharma', email: 'priya@example.com' }),
    content: body,
    fromName: brand.name,
    fromEmail: env.EMAIL_FROM || null,
    smtpReady: smtpReady(),
  };
}

// ─── Create and list ────────────────────────────────────────────────────────

function cleanRecipients(list) {
  const seen = new Map();
  let invalid = 0;
  for (const r of Array.isArray(list) ? list : []) {
    const email = String(r?.email || '').trim().toLowerCase();
    if (!isEmail(email)) { invalid += 1; continue; }
    if (!seen.has(email)) {
      seen.set(email, {
        email,
        name: String(r?.name || '').trim().slice(0, 120) || null,
        contactId: typeof r?.contactId === 'string' ? r.contactId : null,
      });
    }
  }
  return { recipients: [...seen.values()], invalid };
}

export async function create(workspaceId, userId, body) {
  if (!smtpReady()) throw fail(400, 'Email sending is not set up on this server (SMTP settings in backend/.env).');
  const name = String(body.name || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  if (!name) throw fail(400, 'Give the campaign a name.');
  if (!subject) throw fail(400, 'Add a subject line.');
  if (!message && !body.content) throw fail(400, 'Write the message.');

  const { recipients, invalid } = cleanRecipients(body.recipients);
  if (!recipients.length) throw fail(400, 'Add at least one valid email address.');
  if (recipients.length > MAX_RECIPIENTS) throw fail(400, `One campaign can go to at most ${MAX_RECIPIENTS} addresses.`);

  let scheduledAt = null;
  if (body.scheduledAt) {
    scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) throw fail(400, 'The schedule time is not a valid date.');
    if (scheduledAt.getTime() < Date.now() - 60_000) throw fail(400, 'The schedule time is in the past.');
    if (scheduledAt.getTime() - Date.now() > 90 * 86_400_000) throw fail(400, 'Schedule at most 90 days ahead.');
  }

  // Contacts who opted out (replied STOP on WhatsApp, or were marked opted
  // out by hand) are not emailed either; they are kept on the report as skipped.
  const optedOut = new Set((await prisma.contact.findMany({
    where: { workspaceId, optedOut: true, email: { in: recipients.map((r) => r.email), mode: 'insensitive' } },
    select: { email: true },
  })).map((c) => c.email.toLowerCase()));

  const content = body.content ? normalizeContent(body.content) : contentFromMessage(message);
  const accent = /^#[0-9a-f]{6}$/i.test(body.accentColor || '') ? body.accentColor : '#0d9488';
  const skipped = recipients.filter((r) => optedOut.has(r.email)).length;

  const campaign = await prisma.emailCampaign.create({
    data: {
      workspaceId,
      name: name.slice(0, 120),
      subject: subject.slice(0, 150),
      preheader: String(body.preheader || '').trim().slice(0, 160) || null,
      message: message.slice(0, 10_000),
      content,
      accentColor: accent,
      aiRewritten: !!body.aiRewritten,
      status: scheduledAt && scheduledAt.getTime() > Date.now() + 30_000 ? 'SCHEDULED' : 'SENDING',
      total: recipients.length,
      skipped,
      scheduledAt,
      createdByUserId: userId || null,
      recipients: {
        create: recipients.map((r) => ({
          ...r,
          status: optedOut.has(r.email) ? 'SKIPPED' : 'PENDING',
          error: optedOut.has(r.email) ? 'Contact has opted out' : null,
        })),
      },
    },
  });

  await enqueueEmailCampaign(campaign.id, scheduledAt ? scheduledAt.getTime() - Date.now() : 0);
  realtime.campaignUpdated(workspaceId, campaign.id, { status: campaign.status });
  return { ...campaign, invalidAddresses: invalid };
}

export async function list(workspaceId) {
  return prisma.emailCampaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, name: true, subject: true, status: true, total: true, sent: true, failed: true,
      skipped: true, aiRewritten: true, scheduledAt: true, startedAt: true, completedAt: true, createdAt: true,
    },
  });
}

export async function get(workspaceId, id) {
  const c = await prisma.emailCampaign.findFirst({
    where: { id, workspaceId },
    include: { recipients: { orderBy: [{ status: 'asc' }, { email: 'asc' }], take: 1000 } },
  });
  if (!c) throw fail(404, 'Campaign not found');
  const brand = await brandOf(workspaceId);
  const html = renderEmailHtml({
    content: c.content, accentColor: c.accentColor, preheader: c.preheader,
    brandName: brand.name, logoUrl: brand.brandLogoUrl,
  });
  return { ...c, html: personalize(html, { name: 'Priya Sharma', email: 'priya@example.com' }) };
}

export async function cancel(workspaceId, id) {
  const c = await prisma.emailCampaign.findFirst({ where: { id, workspaceId } });
  if (!c) throw fail(404, 'Campaign not found');
  if (!['SCHEDULED', 'SENDING'].includes(c.status)) throw fail(400, 'Only a scheduled or sending campaign can be cancelled.');
  // The worker re-reads the status between batches and stops on CANCELLED.
  const updated = await prisma.emailCampaign.update({
    where: { id }, data: { status: 'CANCELLED', completedAt: new Date() },
  });
  realtime.campaignUpdated(workspaceId, id, { status: 'CANCELLED' });
  return updated;
}

export async function remove(workspaceId, id) {
  const c = await prisma.emailCampaign.findFirst({ where: { id, workspaceId } });
  if (!c) throw fail(404, 'Campaign not found');
  if (c.status === 'SENDING') throw fail(400, 'Cancel the campaign before deleting it.');
  await prisma.emailCampaign.delete({ where: { id } });
  realtime.campaignUpdated(workspaceId, id);
}

// Sends one copy to a single address (normally the user's own) so they can
// see it in a real inbox before sending to everyone.
export async function sendTest(workspaceId, { to, subject, message, content, accentColor, preheader }) {
  if (!smtpReady()) throw fail(400, 'Email sending is not set up on this server (SMTP settings in backend/.env).');
  if (!isEmail(to)) throw fail(400, 'Enter a valid email address for the test.');
  if (!String(subject || '').trim()) throw fail(400, 'Add a subject line first.');
  const brand = await brandOf(workspaceId);
  const html = renderEmailHtml({
    content: content ? normalizeContent(content) : contentFromMessage(message),
    accentColor: accentColor || brand.brandColor, preheader,
    brandName: brand.name, logoUrl: brand.brandLogoUrl,
  });
  const sample = { name: 'Priya Sharma', email: to };
  await sendMail({
    to, subject: `[Test] ${personalizeText(subject, sample)}`, html: personalize(html, sample),
    mustDeliver: true, fromName: brand.name,
  });
  return { ok: true };
}

// ─── Sending (queue worker) ─────────────────────────────────────────────────

async function finish(campaign) {
  const counts = await prisma.emailCampaignRecipient.groupBy({
    by: ['status'], where: { campaignId: campaign.id }, _count: { _all: true },
  });
  const n = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const sent = n.SENT || 0;
  const failed = n.FAILED || 0;
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      sent, failed, skipped: n.SKIPPED || 0,
      status: sent === 0 && failed > 0 ? 'FAILED' : 'COMPLETED',
      completedAt: new Date(),
    },
  });
  realtime.campaignUpdated(campaign.workspaceId, campaign.id, { status: 'COMPLETED' });
}

export async function processCampaign(campaignId) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !['SCHEDULED', 'SENDING'].includes(campaign.status)) return;

  const brand = await brandOf(campaign.workspaceId);
  const html = renderEmailHtml({
    content: campaign.content, accentColor: campaign.accentColor, preheader: campaign.preheader,
    brandName: brand.name, logoUrl: brand.brandLogoUrl,
  });
  // Conditional, so a cancel that lands between the read above and this
  // write is not overwritten back to SENDING.
  const started = await prisma.emailCampaign.updateMany({
    where: { id: campaignId, status: { in: ['SCHEDULED', 'SENDING'] } },
    data: { status: 'SENDING', startedAt: campaign.startedAt ?? new Date() },
  });
  if (!started.count) return;
  realtime.campaignUpdated(campaign.workspaceId, campaignId, { status: 'SENDING' });

  for (;;) {
    const current = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (current?.status !== 'SENDING') return; // cancelled or deleted

    const batch = await prisma.emailCampaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' }, take: BATCH, orderBy: { id: 'asc' },
    });
    if (!batch.length) break;

    for (const r of batch) {
      try {
        await sendMail({
          to: r.email,
          subject: personalizeText(campaign.subject, r),
          html: personalize(html, r),
          mustDeliver: true,
          fromName: brand.name,
        });
        await prisma.emailCampaignRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
        await prisma.emailCampaign.update({ where: { id: campaignId }, data: { sent: { increment: 1 } } });
      } catch (err) {
        await prisma.emailCampaignRecipient.update({
          where: { id: r.id }, data: { status: 'FAILED', error: String(err.message || err).slice(0, 300) },
        });
        await prisma.emailCampaign.update({ where: { id: campaignId }, data: { failed: { increment: 1 } } });
      }
      await sleep(SEND_GAP_MS);
    }
    realtime.campaignUpdated(campaign.workspaceId, campaignId, { status: 'SENDING' });
  }

  await finish(campaign);
}

// Re-queues campaigns a restart interrupted mid-send, and scheduled ones whose
// delayed job may have been lost with Redis. Safe to run on every boot.
export async function recoverEmailCampaigns() {
  const open = await prisma.emailCampaign.findMany({
    where: { status: { in: ['SCHEDULED', 'SENDING'] } },
    select: { id: true, scheduledAt: true },
  });
  for (const c of open) {
    const delay = c.scheduledAt ? c.scheduledAt.getTime() - Date.now() : 0;
    await enqueueEmailCampaign(c.id, delay).catch((err) =>
      console.error(`[EmailCampaign] Could not re-queue ${c.id}:`, err.message));
  }
  return open.length;
}
