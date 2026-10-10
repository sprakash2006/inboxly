import { prisma } from '../lib/prisma.js';
import { notifyWorkspace } from './notification.service.js';
import { realtime } from '../lib/realtimeBus.js';
import { HANDOFF_REASONS } from './automationPause.service.js';

// ─── Human handoff ───────────────────────────────────────────────────────────
//
// `escalationRules` and `escalationThreshold` have been stored on Workspace,
// edited on the AI Agent screen and scored in its readiness meter for a long
// time, and nothing ever read them at runtime: the agent answered every message
// itself and there was no path from automation to a person at all.

// `reasonCode` is what the inbox shows as the reason automation is paused
// (automationPause.service.js HANDOFF_REASONS).
export async function escalateToHuman({
  workspaceId, conversationId, contact, reason, reasonCode = HANDOFF_REASONS.CUSTOMER_ASKED_HUMAN, team = null,
}) {
  // OPEN and unassigned is what the inbox filters treat as "needs a human".
  // Clearing any assignee is deliberate: a thread the AI was handling may have
  // been auto-assigned, and escalation means it is up for grabs again.
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'OPEN',
      assignedToUserId: null,
      // Stops the automation on this thread from here on. Without it the next
      // inbound message ran the whole chain again and the bot talked over the
      // person who had just been handed the conversation.
      humanHandoffAt: new Date(),
      handoffReason: String(reasonCode || HANDOFF_REASONS.CUSTOMER_ASKED_HUMAN).slice(0, 120),
      ...(team ? { label: String(team).slice(0, 60) } : {}),
    },
  }).then(() => realtime.conversationUpdated(workspaceId, conversationId, 'escalated'))
    .catch((err) => console.error('[Escalation] Could not flag the conversation:', err.message));

  await notifyWorkspace(workspaceId, {
    type: 'HANDOFF_REQUESTED',
    title: `${contact?.name || contact?.phoneNumber || 'A customer'} needs a person`,
    body: reason,
    link: 'inbox',
    meta: { conversationId, contactId: contact?.id, team },
  }).catch((err) => console.warn(`[Escalation] Handoff notification failed for ${conversationId}:`, err.message));

  console.log(`[Escalation] Conversation ${conversationId} handed to a human — ${reason}`);
}

// Does this message meet the workspace's own conditions for handing over?
//
// Deliberately lexical, like intent matching: an operator ticking "customer asks
// for a human" needs to be able to predict what that does. The AI agent's own
// uncertainty is handled separately, by escalationThreshold.
const ESCALATION_PATTERNS = {
  asksForHuman: /\b(human|agent|representative|real person|speak to (someone|a person)|talk to (someone|a person)|customer (care|service|support)|operator)\b/i,
  refund: /\b(refund|money back|return it|cancel my order|chargeback|complaint|complain)\b/i,
  negativeSentiment: /\b(terrible|awful|worst|useless|rubbish|angry|furious|disgusted|unacceptable|never again|scam|cheated|fraud)\b/i,
  highIntent: /\b(buy now|place (an )?order|purchase|checkout|payment link|invoice me|how do i pay)\b/i,
};

const ESCALATION_LABELS = {
  asksForHuman: 'The customer asked to speak to a person',
  refund: 'The customer raised a refund or complaint',
  negativeSentiment: 'The message reads as strongly negative',
  highIntent: 'The customer is ready to buy',
};

/** @returns {null | { rule: string, reason: string, reasonCode: string }} */
export function escalationMatch(messageBody, escalationRules) {
  const rules = escalationRules && typeof escalationRules === 'object' ? escalationRules : {};
  for (const [id, pattern] of Object.entries(ESCALATION_PATTERNS)) {
    if (rules[id] === true && pattern.test(messageBody)) {
      return { rule: id, reason: ESCALATION_LABELS[id], reasonCode: `${HANDOFF_REASONS.ESCALATION_RULE}:${id}` };
    }
  }
  return null;
}

export function escalationReason(messageBody, escalationRules) {
  return escalationMatch(messageBody, escalationRules)?.reason ?? null;
}

// The escalation rules belong to the AI agent ("when the agent steps back and
// brings in a human"). They used to apply on any workspace that had ever saved
// the AI Agent screen — which persisted them all switched on — with no agent
// deployed, and ahead of the keyword triggers, so "this is useless" or
// "refund" silently paused automation on the contact (WF-IN-3). They now apply
// only while an agent is deployed.
export const escalationRulesApply = (workspace) => workspace?.aiAgentEnabled === true;
