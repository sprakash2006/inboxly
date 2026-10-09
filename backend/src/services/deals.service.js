import { prisma } from '../lib/prisma.js';
import { assertRecordReferences } from './crmReferences.js';
import { emitCrmEvent } from './crmEvents.service.js';

export const DEAL_STAGES = ['QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
const CLOSED_STAGES = ['CLOSED_WON', 'CLOSED_LOST'];

// Generous budget for multi-step interactive transactions over pooled/remote DB connections
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 };

const DEAL_INCLUDE = {
  contact: { select: { id: true, name: true, phoneNumber: true, email: true } },
  owner: { select: { id: true, name: true, email: true } },
  lead: { select: { id: true, status: true } },
};

// The board used to load every deal in the workspace in one query. Capped by
// default; `total` still counts everything, so a client can tell it got a page.
const LIST_DEFAULT_LIMIT = 500;
const LIST_MAX_LIMIT = 1000;

const notFound = () => { const e = new Error('Deal not found'); e.status = 404; return e; };

function assertStage(stage) {
  if (!DEAL_STAGES.includes(stage)) {
    const e = new Error(`Stage must be one of ${DEAL_STAGES.join(', ')}`); e.status = 400; throw e;
  }
}

export async function listDeals(workspaceId, { stage = '', ownerUserId = '', limit, offset } = {}) {
  const take = Math.min(Math.max(Number.parseInt(limit, 10) || LIST_DEFAULT_LIMIT, 1), LIST_MAX_LIMIT);
  const skip = Math.max(Number.parseInt(offset, 10) || 0, 0);
  const where = {
    workspaceId,
    ...(stage ? { stage } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.deal.findMany({ where, include: DEAL_INCLUDE, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take }),
    prisma.deal.count({ where }),
  ]);
  return { data, total, limit: take, offset: skip };
}

export async function getDeal(workspaceId, id) {
  const deal = await prisma.deal.findFirst({
    where: { id, workspaceId },
    include: {
      ...DEAL_INCLUDE,
      stageHistory: {
        orderBy: { changedAt: 'asc' },
        include: { changedByUser: { select: { id: true, name: true } } },
      },
    },
  });
  if (!deal) throw notFound();
  return deal;
}

export async function createDeal(workspaceId, body, userId) {
  const contact = await prisma.contact.findFirst({ where: { id: body.contactId, workspaceId }, select: { id: true } });
  if (!contact) { const e = new Error('Contact not found'); e.status = 404; throw e; }
  if (body.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: body.leadId, workspaceId }, select: { id: true } });
    if (!lead) { const e = new Error('Lead not found'); e.status = 404; throw e; }
  }
  await assertRecordReferences(workspaceId, { ownerUserId: body.ownerUserId });

  const stage = body.stage || 'QUALIFICATION';
  assertStage(stage);

  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        workspaceId,
        contactId: body.contactId,
        leadId: body.leadId ?? null,
        title: body.title,
        value: body.value ?? null,
        currency: body.currency || 'INR',
        stage,
        ownerUserId: body.ownerUserId ?? null,
        expectedCloseDate: body.expectedCloseDate ?? null,
        closedAt: CLOSED_STAGES.includes(stage) ? new Date() : null,
      },
      include: DEAL_INCLUDE,
    });
    await tx.dealStageHistory.create({
      data: { workspaceId, dealId: created.id, fromStage: null, toStage: stage, changedByUserId: userId ?? null },
    });
    return created;
  }, TX_OPTS);

  // A new deal enters its first stage, which a "deal enters stage" workflow
  // must see the same as a move. Emitted after the commit, like every move.
  emitCrmEvent(workspaceId, 'deal_stage_changed', {
    dealId: deal.id, leadId: deal.leadId ?? null, contactId: deal.contactId, stage, previousStage: null,
  });
  return deal;
}

// Stage is deliberately not updatable here — it moves only through
// updateDealStage(), which is what guarantees every move lands in the history.
export async function updateDeal(workspaceId, id, updates) {
  const deal = await prisma.deal.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!deal) throw notFound();
  await assertRecordReferences(workspaceId, { ownerUserId: updates.ownerUserId });

  const data = {};
  for (const key of ['title', 'value', 'currency', 'ownerUserId', 'expectedCloseDate']) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }
  return prisma.deal.update({ where: { id }, data, include: DEAL_INCLUDE });
}

export async function deleteDeal(workspaceId, id) {
  const deal = await prisma.deal.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!deal) throw notFound();
  await prisma.deal.delete({ where: { id } });
}

// One row of stage history per move, written in the same transaction as the
// move itself — the pipeline board's drag/drop is only auditable if a stage
// change can never be recorded without its history entry.
export async function updateDealStage(workspaceId, id, stageOrObj, userId) {
  const stage = typeof stageOrObj === 'string' ? stageOrObj : stageOrObj?.stage;
  const lostReason = typeof stageOrObj === 'object' ? stageOrObj?.lostReason : null;
  assertStage(stage);

  const updated = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({ where: { id, workspaceId } });
    if (!deal) throw notFound();

    const moved = await tx.deal.update({
      where: { id },
      data: {
        stage,
        closedAt: CLOSED_STAGES.includes(stage) ? (deal.closedAt ?? new Date()) : null,
        lostReason: stage === 'CLOSED_LOST' ? (lostReason ?? deal.lostReason ?? null) : null,
      },
      include: DEAL_INCLUDE,
    });
    await tx.dealStageHistory.create({
      data: { workspaceId, dealId: id, fromStage: deal.stage, toStage: stage, changedByUserId: userId ?? null },
    });
    return { ...moved, previousStage: deal.stage };
  }, TX_OPTS);

  // Emitted after the transaction commits, so a workflow can never observe a
  // stage change that later rolled back.
  if (updated.previousStage !== stage) {
    emitCrmEvent(workspaceId, 'deal_stage_changed', {
      dealId: id, leadId: updated.leadId ?? null, contactId: updated.contactId, stage, previousStage: updated.previousStage,
    });
  }
  return updated;
}
