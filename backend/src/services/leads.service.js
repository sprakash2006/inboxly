import { prisma } from '../lib/prisma.js';
import { listWindow } from '../lib/paging.js';
import { resolveContactPhone, findContactByPhone } from './contacts.service.js';
import { emitCrmEvent } from './crmEvents.service.js';
import { assertRecordReferences } from './crmReferences.js';
import { assertContactCapacity } from './subscription.service.js';

// The lead lifecycle. CONVERTED is only ever set by convertLead.
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];
export const DEAL_STAGES = ['QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];

const LEAD_INCLUDE = {
  contact: { select: { id: true, name: true, phoneNumber: true, email: true, tags: true, optedOut: true } },
  owner: { select: { id: true, name: true, email: true } },
};

const notFound = () => { const e = new Error('Lead not found'); e.status = 404; return e; };
const badRequest = (message) => { const e = new Error(message); e.status = 400; return e; };

function assertStatus(status) {
  if (!LEAD_STATUSES.includes(status) || status === 'CONVERTED') {
    throw badRequest(`Status must be one of ${LEAD_STATUSES.filter((s) => s !== 'CONVERTED').join(', ')}`);
  }
}

export async function listLeads(workspaceId, { status = '', source = '', ownerUserId = '', search = '', preset = '', limit, offset } = {}, user = null) {
  const { take, skip } = listWindow({ limit, offset });
  const where = {
    workspaceId,
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(preset === 'my' && user?.id ? { ownerUserId: user.id } : {}),
  };

  const q = String(search || '').trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    where.contact = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q } },
        ...(digits.length >= 3 ? [{ phoneNumber: { contains: digits } }] : []),
      ],
    };
  }

  const [data, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        ...LEAD_INCLUDE,
        tasks: {
          where: { status: 'PENDING' },
          orderBy: { dueDate: 'asc' },
          take: 1,
          select: { id: true, title: true, dueDate: true, status: true },
        },
        _count: { select: { tasks: true, crmActivities: true, deals: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
    prisma.lead.count({ where }),
  ]);
  return { data, total, limit: take, offset: skip };
}

export async function getLead(workspaceId, id) {
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId },
    include: {
      ...LEAD_INCLUDE,
      deals: { orderBy: { createdAt: 'desc' } },
      tasks: { orderBy: { dueDate: 'asc' } },
      crmActivities: {
        include: { createdByUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!lead) throw notFound();
  return lead;
}

// Accepts either an existing contactId, or name + phoneNumber to create the
// contact first. The contact is the single source of truth for identity: a
// lead never carries its own copy of name or phone.
export async function createLead(workspaceId, body) {
  await assertRecordReferences(workspaceId, { ownerUserId: body.ownerUserId });
  const status = body.status || 'NEW';
  assertStatus(status);

  let contactId = body.contactId;
  if (contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } });
    if (!contact) { const e = new Error('Contact not found'); e.status = 404; throw e; }
  } else {
    const { phoneNumber, country } = await resolveContactPhone(workspaceId, body.phoneNumber);
    const existing = await findContactByPhone(workspaceId, phoneNumber, { country });
    if (existing) {
      contactId = existing.id;
    } else {
      await assertContactCapacity(workspaceId);
      const created = await prisma.contact.create({
        data: { workspaceId, name: body.name || phoneNumber, phoneNumber, email: body.email || null },
      });
      contactId = created.id;
      import('./outgoingWebhook.service.js')
        .then((m) => m.emitContactCreated(workspaceId, created, { source: 'lead' }))
        .catch((err) => console.warn('[Webhook:out] contact.created not sent:', err.message));
    }
  }

  const duplicate = await prisma.lead.findUnique({ where: { contactId }, select: { id: true } });
  if (duplicate) { const e = new Error('This contact is already a lead'); e.status = 409; throw e; }

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      contactId,
      status,
      source: body.source ?? null,
      ownerUserId: body.ownerUserId ?? null,
      notes: body.notes ?? null,
    },
    include: LEAD_INCLUDE,
  });

  // Fire-and-forget: an automation must never delay or fail the write that
  // triggered it.
  emitCrmEvent(workspaceId, 'lead_created', { leadId: lead.id, contactId });
  return lead;
}

// Only status, source, owner and notes are editable; anything else in
// `updates` (from an AI agent, say) is ignored.
export async function updateLead(workspaceId, id, updates) {
  const lead = await prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true, status: true, contactId: true } });
  if (!lead) throw notFound();
  await assertRecordReferences(workspaceId, { ownerUserId: updates.ownerUserId });

  const data = {};
  if (updates.status !== undefined) {
    if (lead.status === 'CONVERTED') throw badRequest('A converted lead keeps its status');
    assertStatus(updates.status);
    data.status = updates.status;
  }
  if (updates.source !== undefined) data.source = updates.source || null;
  if (updates.ownerUserId !== undefined) data.ownerUserId = updates.ownerUserId || null;
  if (updates.notes !== undefined) data.notes = updates.notes || null;

  const updated = await prisma.lead.update({ where: { id }, data, include: LEAD_INCLUDE });

  if (data.status && data.status !== lead.status) {
    emitCrmEvent(workspaceId, 'lead_status_changed', {
      leadId: id, contactId: updated.contactId, status: data.status, previousStatus: lead.status,
    });
  }
  return updated;
}

export async function deleteLead(workspaceId, id) {
  const lead = await prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true, contactId: true } });
  if (!lead) throw notFound();
  await prisma.lead.delete({ where: { id } });
  emitCrmEvent(workspaceId, 'lead_deleted', { leadId: id, contactId: lead.contactId });
}

// Transactional by design: a conversion that created a Deal but failed to mark
// the Lead converted would let the same lead be converted twice.
//
// The lead is claimed with a conditional update before the deal is created:
// two concurrent converts (a double click, the UI racing a workflow) used to
// both pass a plain "already converted?" read and create two deals. The second
// now blocks on the row, re-checks the condition and matches nothing.
export async function convertLead(workspaceId, id, body, userId) {
  const stage = body.stage || 'QUALIFICATION';
  if (!DEAL_STAGES.includes(stage)) throw badRequest(`Stage must be one of ${DEAL_STAGES.join(', ')}`);
  await assertRecordReferences(workspaceId, { ownerUserId: body.ownerUserId });

  const { deal, lead: original } = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id, workspaceId } });
    if (!lead) throw notFound();

    const claimed = await tx.lead.updateMany({
      where: { id: lead.id, workspaceId, convertedDealId: null, status: { not: 'CONVERTED' } },
      data: { status: 'CONVERTED', convertedAt: new Date() },
    });
    if (claimed.count === 0) {
      const e = new Error('Lead has already been converted'); e.status = 409; throw e;
    }

    const created = await tx.deal.create({
      data: {
        workspaceId,
        leadId: lead.id,
        contactId: lead.contactId,
        title: body.title,
        value: body.value ?? null,
        currency: body.currency || 'INR',
        stage,
        ownerUserId: body.ownerUserId ?? lead.ownerUserId ?? null,
        expectedCloseDate: body.expectedCloseDate ?? null,
      },
    });

    await tx.dealStageHistory.create({
      data: { workspaceId, dealId: created.id, fromStage: null, toStage: stage, changedByUserId: userId ?? null },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { convertedDealId: created.id } });
    return { deal: created, lead };
  });

  emitCrmEvent(workspaceId, 'lead_status_changed', {
    leadId: original.id, contactId: original.contactId, status: 'CONVERTED', previousStatus: original.status,
  });
  // The deal starts life in a stage, which is a stage change as far as a
  // "deal enters stage" workflow is concerned.
  emitCrmEvent(workspaceId, 'deal_stage_changed', {
    dealId: deal.id, leadId: original.id, contactId: original.contactId, stage: deal.stage, previousStage: null,
  });
  return deal;
}
