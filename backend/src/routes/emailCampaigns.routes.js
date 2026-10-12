// Email campaigns: /api/v1/workspaces/:workspaceId/email-campaigns
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { workspaceContext } from '../middleware/workspaceContext.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../validators/index.js';
import * as service from '../services/emailCampaigns.service.js';

const router = Router({ mergeParams: true });
router.use(authenticate, workspaceContext);

const content = z.object({
  headline: z.string().max(200).optional(),
  paragraphs: z.array(z.string().max(2000)).max(12).optional(),
  bullets: z.array(z.string().max(400)).max(12).optional(),
  ctaText: z.string().max(80).optional(),
  ctaUrl: z.string().max(2000).optional(),
  signoff: z.string().max(400).optional(),
}).partial();

const accentColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();
const draft = {
  message: z.string().max(10_000).optional().default(''),
  content: content.nullish(),
  accentColor,
  preheader: z.string().max(200).nullish(),
};

// Exported for the public API (routes/public.routes.js), which takes the same bodies.
export const schemas = {
  compose: z.object({
    message: z.string().min(1, 'Write a message first').max(10_000),
    tone: z.enum(['friendly', 'professional', 'promotional', 'short']).optional(),
    subject: z.string().max(200).optional(),
  }),
  preview: z.object(draft),
  test: z.object({ ...draft, to: z.string().email('Enter a valid email address'), subject: z.string().max(200) }),
  create: z.object({
    ...draft,
    name: z.string().min(1, 'Give the campaign a name').max(120),
    subject: z.string().min(1, 'Add a subject line').max(200),
    aiRewritten: z.boolean().optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullish(),
    recipients: z.array(z.object({
      email: z.string().max(320),
      name: z.string().max(200).nullish(),
      contactId: z.string().max(64).nullish(),
    })).min(1, 'Add at least one recipient').max(service.MAX_RECIPIENTS),
  }),
};

// Every handler has the same shape: run the service, send its result, and
// turn a thrown { status, message } into the JSON error the frontend shows.
const handle = (fn, status = 200) => async (req, res) => {
  try {
    const out = await fn(req);
    if (out === undefined) return res.status(204).end();
    res.status(status).json(out);
  } catch (err) {
    if (!err.status || err.status >= 500) console.error('[EmailCampaigns]', err);
    res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong with the email campaign' });
  }
};

const ws = (req) => req.params.workspaceId;

// Viewing is open to the workspace; composing and sending is member work,
// the same split as WhatsApp campaigns.
router.get('/', handle((req) => service.list(ws(req))));
router.post('/compose', authorize('CLIENT'), validate({ body: schemas.compose }), handle((req) => service.compose(ws(req), req.body)));
router.post('/preview', authorize('CLIENT'), validate({ body: schemas.preview }), handle((req) => service.preview(ws(req), req.body)));
router.post('/test', authorize('CLIENT'), validate({ body: schemas.test }), handle((req) => service.sendTest(ws(req), req.body)));
router.post('/', authorize('CLIENT'), validate({ body: schemas.create }), handle((req) => service.create(ws(req), req.user?.id, req.body), 201));
router.get('/:id', handle((req) => service.get(ws(req), req.params.id)));
router.post('/:id/cancel', authorize('CLIENT'), handle((req) => service.cancel(ws(req), req.params.id)));
router.delete('/:id', authorize('CLIENT'), handle((req) => service.remove(ws(req), req.params.id)));

export default router;
