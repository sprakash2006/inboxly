import { prisma } from '../lib/prisma.js';
import { resolveCrmReferences } from './crmReferences.js';

const TASK_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  lead: { select: { id: true, status: true } },
  deal: { select: { id: true, title: true, stage: true } },
  contact: { select: { id: true, name: true, email: true } },
};

// Capped by default instead of returning every matching task; `total` still
// counts everything, so a client can tell it got a page.
const LIST_DEFAULT_LIMIT = 500;
const LIST_MAX_LIMIT = 1000;

const notFound = () => { const e = new Error('Task not found'); e.status = 404; return e; };

export async function listTasks(workspaceId, { status, assignedToUserId, isOverdue, limit, offset } = {}) {
  const take = Math.min(Math.max(Number.parseInt(limit, 10) || LIST_DEFAULT_LIMIT, 1), LIST_MAX_LIMIT);
  const skip = Math.max(Number.parseInt(offset, 10) || 0, 0);
  const where = {
    workspaceId,
    ...(status ? { status } : {}),
    ...(assignedToUserId ? { assignedToUserId } : {}),
  };

  if (isOverdue === 'true') {
    where.status = 'PENDING';
    where.dueDate = { lt: new Date() };
  }

  const [data, total] = await Promise.all([
    prisma.task.findMany({ where, include: TASK_INCLUDE, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], skip, take }),
    prisma.task.count({ where }),
  ]);

  return { data, total, limit: take, offset: skip };
}

export async function getTask(workspaceId, id) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId }, include: TASK_INCLUDE });
  if (!task) throw notFound();
  return task;
}

export async function createTask(workspaceId, body, userId) {
  const refs = await resolveCrmReferences(workspaceId, body, { includeAssignee: true });

  return prisma.task.create({
    data: {
      workspaceId,
      title: body.title,
      description: body.description ?? null,
      status: body.status || 'PENDING',
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedToUserId: refs.assignedToUserId ?? userId,
      leadId: refs.leadId ?? null,
      dealId: refs.dealId ?? null,
      contactId: refs.contactId ?? null,
      completedAt: body.status === 'COMPLETED' ? new Date() : null,
    },
    include: TASK_INCLUDE,
  });
}

// Only the fields listed here can be written. Spreading `updates` straight
// into Prisma let a caller pass workspaceId and move the task out of the
// workspace entirely, which the route schema now also rejects — this is the
// second line of defence.
const TASK_WRITABLE = ['title', 'description', 'status', 'dueDate'];

export async function updateTask(workspaceId, id, updates) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId }, select: { id: true, status: true } });
  if (!task) throw notFound();

  const refs = await resolveCrmReferences(workspaceId, updates, { includeAssignee: true });

  const data = { ...refs };
  for (const key of TASK_WRITABLE) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }
  if (data.dueDate) data.dueDate = new Date(data.dueDate);

  if (data.status && data.status !== task.status) {
    data.completedAt = data.status === 'COMPLETED' ? new Date() : null;
  }

  return prisma.task.update({ where: { id }, data, include: TASK_INCLUDE });
}

export async function deleteTask(workspaceId, id) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!task) throw notFound();
  await prisma.task.delete({ where: { id } });
}
