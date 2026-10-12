import { Router } from 'express';
import { authenticateApiKey } from '../middleware/authenticateApiKey.js';
import { rateLimit, apiKeyIdentity, recipientIdentity } from '../middleware/rateLimit.js';
import { requireScope } from '../lib/apiScopes.js';
import * as templatesController from '../controllers/templates.controller.js';
import * as campaignsController from '../controllers/campaigns.controller.js';
import * as contactsController from '../controllers/contacts.controller.js';
import * as settingsService from '../services/settings.service.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as walletController from '../controllers/wallet.controller.js';
import * as aiAgentController from '../controllers/aiAgent.controller.js';
import * as automationController from '../controllers/automation.controller.js';
import * as publicIdentityController from '../controllers/publicIdentity.controller.js';
import * as segmentsController from '../controllers/segments.controller.js';
import * as conversationsController from '../controllers/conversations.controller.js';
import * as whatsappController from '../controllers/whatsapp.controller.js';
import * as optOutController from '../controllers/optout.controller.js';
import * as emailCampaigns from '../services/emailCampaigns.service.js';
import { schemas as emailSchemas } from './emailCampaigns.routes.js';
import { sendPublicMessage } from '../services/publicMessage.service.js';
import { uploader, verifyFileContents, uploadRateLimit, ACCEPTS } from '../lib/uploadGuard.js';
import { realtime } from '../lib/realtimeBus.js';
import {
  validate, templateSchemas, campaignSchemas, contactSchemas, segmentSchemas, optOutSchemas,
  settingsSchemas, publicApiSchemas,
} from '../validators/index.js';

const router = Router();

// 1. Authenticate all public routes. The address-level limit in front bounds
//    the key lookups one client can cause; the per-key limit after it is the
//    real budget, whatever address the key is used from.
router.use(rateLimit({ windowMs: 60_000, max: 600, keyPrefix: 'public-api-ip' }));
router.use(authenticateApiKey);
router.use(rateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'public-api', by: apiKeyIdentity }));

// Sends cost money and reach real people: a tighter per-key budget, and a cap
// per recipient so one number cannot be flooded.
const sendLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyPrefix: 'public-send',
  by: apiKeyIdentity,
  subject: recipientIdentity('to'),
  subjectMax: 10,
});

// Replies into an existing conversation name no `to`; the conversation is the
// recipient, so that is what gets the per-recipient cap.
const conversationSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyPrefix: 'public-send',
  by: apiKeyIdentity,
  subject: (req) => (req.params?.id ? `conversation:${req.params.id}` : null),
  subjectMax: 10,
});

// A test email reaches a real inbox: the same budget shape as a WhatsApp send.
const emailTestLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'public-email-test',
  by: apiKeyIdentity,
  subject: recipientIdentity('to'),
  subjectMax: 5,
});

const templateUpload = uploader(ACCEPTS.templateMedia, 100 * 1024 * 1024);
const csvUpload = uploader(ACCEPTS.csv, 10 * 1024 * 1024);

// 2. Inject workspaceId into req.params just before controller executes
//    to avoid Express wiping req.params when matching route paths.
const injectWorkspace = (fn) => (req, res, next) => {
  req.params.workspaceId = req.workspaceId;
  return fn(req, res, next);
};

// For handlers that record who acted (Message.senderUserId is a foreign key to
// User). A key is not a user, so its sends are stored unattributed — the same
// as an automation's — rather than failing the insert.
const asApiKey = (fn) => injectWorkspace((req, res, next) => {
  req.user = { ...req.user, id: null, name: req.apiKey?.name ? `API key: ${req.apiKey.name}` : 'API key' };
  return fn(req, res, next);
});

// The dashboard's campaign and template screens refresh on these events; a
// change made through the API should show up there just the same.
const announce = (publish) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    try { publish(req); } catch { /* never fail a write over a notification */ }
  });
  next();
};
const campaignChanged = announce((req) => realtime.campaignUpdated(req.workspaceId, req.params.id ?? null));
const templateChanged = announce((req) => realtime.templateUpdated(req.workspaceId));

// Email campaign handlers call the service directly, as the dashboard route
// does, and turn a thrown { status, message } into the usual JSON error.
const emailHandler = (fn, status = 200) => async (req, res) => {
  try {
    const out = await fn(req);
    if (out === undefined) return res.status(204).end();
    res.status(status).json(out);
  } catch (err) {
    if (!err.status || err.status >= 500) console.error('[PublicAPI][EmailCampaigns]', err);
    res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong with the email campaign' });
  }
};

// --- Identity ---
// Which workspace does this key belong to, and which numbers can it send from?
// No scope required: a key should always be able to identify itself, and an
// integration that cannot name the workspace it is acting on is one wrong paste
// away from messaging another business's customers from their number.
router.get('/me', publicIdentityController.me);

// --- Messages ---
router.post('/messages', requireScope('messages:send'), sendLimiter, validate({ body: publicApiSchemas.sendMessage }), async (req, res, next) => {
  try {
    const result = await sendPublicMessage(req.workspaceId, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// --- WhatsApp numbers ---
router.get('/numbers', requireScope('numbers:read'), injectWorkspace(whatsappController.listNumbers));
router.get('/numbers/:id/health', requireScope('numbers:read'), injectWorkspace(whatsappController.health));

// --- Conversations (WhatsApp inbox) ---
router.get('/conversations', requireScope('conversations:read'), injectWorkspace(conversationsController.list));
// Open (or find) the conversation with a contact: { contactId, waNumberId? }.
router.post('/conversations', requireScope('conversations:write'), injectWorkspace(conversationsController.createOrGet));
router.get('/conversations/:id/messages', requireScope('conversations:read'), injectWorkspace(conversationsController.getMessages));
router.post('/conversations/:id/messages', requireScope('conversations:write'), conversationSendLimiter, asApiKey(conversationsController.sendMessage));
router.post('/conversations/:id/template', requireScope('conversations:write'), conversationSendLimiter, asApiKey(conversationsController.sendTemplate));

// --- Templates ---
router.get('/templates', requireScope('templates:read'), injectWorkspace(templatesController.list));
router.post('/templates', requireScope('templates:write'), validate({ body: templateSchemas.create }), templateChanged, injectWorkspace(templatesController.create));
// Literal paths before '/templates/:id' so they are not read as a template id.
router.get('/templates/library', requireScope('templates:read'), injectWorkspace(templatesController.library));
router.post('/templates/library/:libId/install', requireScope('templates:write'), templateChanged, injectWorkspace(templatesController.installLibrary));
router.post('/templates/sync', requireScope('templates:write'), templateChanged, injectWorkspace(templatesController.syncFromMeta));
// Header image / video / document sample, as multipart `file`. Returns the
// handle to put in the template's HEADER component.
router.post('/templates/media', requireScope('templates:write'), uploadRateLimit, templateUpload.single('file'), verifyFileContents, injectWorkspace(templatesController.uploadMedia));
router.get('/templates/media/:assetId', requireScope('templates:read'), injectWorkspace(templatesController.headerImage));
router.get('/templates/:id', requireScope('templates:read'), injectWorkspace(templatesController.getOne));
router.put('/templates/:id', requireScope('templates:write'), validate({ body: templateSchemas.update }), templateChanged, injectWorkspace(templatesController.update));
router.delete('/templates/:id', requireScope('templates:write'), templateChanged, injectWorkspace(templatesController.remove));
router.post('/templates/:id/duplicate', requireScope('templates:write'), templateChanged, injectWorkspace(templatesController.duplicate));
router.post('/templates/:id/restore', requireScope('templates:write'), templateChanged, injectWorkspace(templatesController.restore));

// --- WhatsApp campaigns ---
router.get('/campaigns', requireScope('campaigns:read'), injectWorkspace(campaignsController.list));
router.post('/campaigns', requireScope('campaigns:write'), validate({ body: campaignSchemas.create }), campaignChanged, injectWorkspace(campaignsController.create));
// What a send would cost before launching it: quota used, wallet charge, per-category price.
router.post('/campaigns/estimate', requireScope('campaigns:read'), validate({ body: campaignSchemas.estimate }), injectWorkspace(campaignsController.estimate));
// A CSV of recipients with a value per person for the template's variables.
// Creates or matches the contacts; returns their ids and each row's values.
router.post('/campaigns/audience-import', requireScope('campaigns:write'), uploadRateLimit, csvUpload.single('file'), verifyFileContents, injectWorkspace(campaignsController.audienceImport));
router.get('/campaigns/:id', requireScope('campaigns:read'), injectWorkspace(campaignsController.getOne));
router.patch('/campaigns/:id', requireScope('campaigns:write'), validate({ body: campaignSchemas.update }), campaignChanged, injectWorkspace(campaignsController.update));
router.get('/campaigns/:id/recipients/export', requireScope('campaigns:read'), injectWorkspace(campaignsController.exportRecipients));
router.post('/campaigns/:id/recipients', requireScope('campaigns:write'), validate({ body: campaignSchemas.addRecipients }), campaignChanged, injectWorkspace(campaignsController.addRecipients));
router.put('/campaigns/:id/recipients', requireScope('campaigns:write'), validate({ body: campaignSchemas.setRecipients }), campaignChanged, injectWorkspace(campaignsController.setRecipients));
router.put('/campaigns/:id/recipient-values', requireScope('campaigns:write'), validate({ body: campaignSchemas.recipientValues }), injectWorkspace(campaignsController.setRecipientValues));
router.post('/campaigns/:id/launch', requireScope('campaigns:write'), validate({ body: campaignSchemas.launch }), campaignChanged, injectWorkspace(campaignsController.launch));
router.post('/campaigns/:id/pause', requireScope('campaigns:write'), campaignChanged, injectWorkspace(campaignsController.pause));
router.post('/campaigns/:id/resume', requireScope('campaigns:write'), campaignChanged, injectWorkspace(campaignsController.resume));
router.post('/campaigns/:id/cancel', requireScope('campaigns:write'), campaignChanged, injectWorkspace(campaignsController.cancel));

// --- Email campaigns ---
router.get('/email-campaigns', requireScope('email-campaigns:read'), emailHandler((req) => emailCampaigns.list(req.workspaceId)));
// AI rewrite of a plain message into a structured email. Sends nothing.
router.post('/email-campaigns/compose', requireScope('email-campaigns:write'), validate({ body: emailSchemas.compose }), emailHandler((req) => emailCampaigns.compose(req.workspaceId, req.body)));
// The rendered HTML of a draft, exactly as recipients will get it. Sends nothing.
router.post('/email-campaigns/preview', requireScope('email-campaigns:read'), validate({ body: emailSchemas.preview }), emailHandler((req) => emailCampaigns.preview(req.workspaceId, req.body)));
router.post('/email-campaigns/test', requireScope('email-campaigns:write'), emailTestLimiter, validate({ body: emailSchemas.test }), emailHandler((req) => emailCampaigns.sendTest(req.workspaceId, req.body)));
router.post('/email-campaigns', requireScope('email-campaigns:write'), validate({ body: emailSchemas.create }), emailHandler((req) => emailCampaigns.create(req.workspaceId, null, req.body), 201));
router.get('/email-campaigns/:id', requireScope('email-campaigns:read'), emailHandler((req) => emailCampaigns.get(req.workspaceId, req.params.id)));
router.post('/email-campaigns/:id/cancel', requireScope('email-campaigns:write'), emailHandler((req) => emailCampaigns.cancel(req.workspaceId, req.params.id)));
router.delete('/email-campaigns/:id', requireScope('email-campaigns:write'), emailHandler((req) => emailCampaigns.remove(req.workspaceId, req.params.id)));

// --- Contacts ---
router.get('/contacts', requireScope('contacts:read'), injectWorkspace(contactsController.list));
router.post('/contacts', requireScope('contacts:write'), validate({ body: contactSchemas.create }), injectWorkspace(contactsController.create));
// Literal paths before '/contacts/:id'.
router.get('/contacts/tags', requireScope('contacts:read'), injectWorkspace(contactsController.tags));
router.get('/contacts/export', requireScope('contacts:read'), injectWorkspace(contactsController.exportCsv));
// Bulk import, as a multipart CSV `file` — the same columns as the dashboard import.
router.post('/contacts/import', requireScope('contacts:write'), uploadRateLimit, csvUpload.single('file'), verifyFileContents, injectWorkspace(contactsController.importCsv));
router.get('/contacts/:id', requireScope('contacts:read'), injectWorkspace(contactsController.getOne));
router.put('/contacts/:id', requireScope('contacts:write'), validate({ body: contactSchemas.update }), injectWorkspace(contactsController.update));
router.patch('/contacts/:id', requireScope('contacts:write'), validate({ body: contactSchemas.update }), injectWorkspace(contactsController.update));
router.delete('/contacts/:id', requireScope('contacts:write'), injectWorkspace(contactsController.remove));

// --- Segments (saved audiences for campaigns) ---
router.get('/segments', requireScope('contacts:read'), injectWorkspace(segmentsController.listSegments));
router.post('/segments', requireScope('contacts:write'), validate({ body: segmentSchemas.create }), injectWorkspace(segmentsController.createSegment));
router.patch('/segments/:id', requireScope('contacts:write'), validate({ body: segmentSchemas.update }), injectWorkspace(segmentsController.updateSegment));
router.delete('/segments/:id', requireScope('contacts:write'), injectWorkspace(segmentsController.deleteSegment));
router.post('/segments/:id/contacts', requireScope('contacts:write'), injectWorkspace(segmentsController.addContactToSegment));
router.delete('/segments/:id/contacts/:contactId', requireScope('contacts:write'), injectWorkspace(segmentsController.removeContactFromSegment));

// --- Opt-outs (numbers that must not be messaged) ---
router.get('/opt-outs', requireScope('opt-outs:read'), injectWorkspace(optOutController.list));
router.post('/opt-outs', requireScope('opt-outs:write'), validate({ body: optOutSchemas.block }), asApiKey(optOutController.block));
router.delete('/opt-outs/:id', requireScope('opt-outs:write'), asApiKey(optOutController.unblock));

// --- Analytics ---
router.get('/analytics/summary', requireScope('analytics:read'), injectWorkspace(analyticsController.overview));

// --- Wallet ---
router.get('/wallet/balance', requireScope('wallet:read'), injectWorkspace(walletController.getWallet));
router.get('/wallet/summary', requireScope('wallet:read'), injectWorkspace(walletController.getSummary));

// --- AI Agent ---
router.get('/ai-agent/config', requireScope('ai-agent:read'), injectWorkspace(aiAgentController.getConfig));
router.post('/ai-agent/query', requireScope('ai-agent:write'), injectWorkspace(aiAgentController.test));

// --- Automations ---
router.get('/automations', requireScope('automations:read'), injectWorkspace(automationController.list));

// --- Webhooks ---
// Register the workspace webhook URL (and optionally which events it gets).
// Validated by the dashboard's own schema, and the service refuses any URL
// that does not resolve to a public address.
const publicWebhookBody = settingsSchemas.update
  .pick({ webhookUrl: true, webhookEvents: true })
  .refine((v) => v.webhookUrl !== undefined, { message: 'webhookUrl is required', path: ['webhookUrl'] });

router.post('/webhooks', requireScope('webhooks:write'), validate({ body: publicWebhookBody }), async (req, res, next) => {
  try {
    const { webhookUrl, webhookEvents } = req.body;
    const settings = await settingsService.updateSettings(req.workspaceId, { webhookUrl, webhookEvents });
    // Same body the dashboard gets, including the signing secret the receiver
    // needs to verify deliveries.
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

export default router;
