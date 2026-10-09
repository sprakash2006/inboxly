import { prisma } from '../lib/prisma.js';
import { listWindow } from '../lib/paging.js';
import { resolveCrmReferences } from './crmReferences.js';

const ACTIVITY_INCLUDE = {
  createdByUser: { select: { id: true, name: true, email: true } },
  lead: { select: { id: true, status: true, contact: { select: { id: true, name: true, phoneNumber: true } } } },
  deal: { select: { id: true, title: true, stage: true, value: true, currency: true } },
  contact: { select: { id: true, name: true, email: true, phoneNumber: true } },
};

const DEAL_TIMELINE_MAX = 1000;

// Notes, calls, emails and meetings logged against a lead, deal or contact.
// A request for one deal's timeline also gets that deal's stage changes, merged
// newest first, so the deal screen shows a single history.
export async function listActivities(workspaceId, { leadId, dealId, contactId, type, limit = 200, page = 1 } = {}) {
  ({ take: limit } = listWindow({ limit }, { defaultLimit: 200, maxLimit: 1000 }));
  page = Math.max(Number.parseInt(page, 10) || 1, 1);

  const where = { workspaceId };
  if (leadId) where.leadId = leadId;
  if (dealId) where.dealId = dealId;
  if (contactId) where.contactId = contactId;
  if (type && ['CALL', 'MEETING', 'NOTE', 'EMAIL'].includes(String(type).toUpperCase())) {
    where.type = String(type).toUpperCase();
  }

  if (dealId && !leadId && !contactId && !type) {
    const [activities, stageHistory] = await Promise.all([
      prisma.crmActivity.findMany({ where, include: ACTIVITY_INCLUDE, orderBy: { createdAt: 'desc' }, take: DEAL_TIMELINE_MAX }),
      prisma.dealStageHistory.findMany({
        where: { workspaceId, dealId },
        include: { changedByUser: { select: { id: true, name: true } } },
        orderBy: { changedAt: 'desc' },
        take: DEAL_TIMELINE_MAX,
      }),
    ]);

    const feed = [
      ...activities.map((a) => ({ ...a, feedType: 'ACTIVITY' })),
      ...stageHistory.map((h) => ({
        id: h.id,
        feedType: 'STAGE_CHANGE',
        fromStage: h.fromStage,
        toStage: h.toStage,
        createdAt: h.changedAt,
        createdByUser: h.changedByUser,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return { data: feed, total: feed.length };
  }

  const [data, total] = await Promise.all([
    prisma.crmActivity.findMany({
      where,
      include: ACTIVITY_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.crmActivity.count({ where }),
  ]);
  return { data, total };
}

export async function createActivity(workspaceId, body, userId) {
  const refs = await resolveCrmReferences(workspaceId, body);
  return prisma.crmActivity.create({
    data: {
      workspaceId,
      type: body.type || 'NOTE',
      content: body.content,
      createdByUserId: userId,
      leadId: refs.leadId ?? null,
      dealId: refs.dealId ?? null,
      contactId: refs.contactId ?? null,
    },
    include: ACTIVITY_INCLUDE,
  });
}

export async function deleteActivity(workspaceId, id) {
  const activity = await prisma.crmActivity.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!activity) { const e = new Error('Activity not found'); e.status = 404; throw e; }
  await prisma.crmActivity.delete({ where: { id } });
}
