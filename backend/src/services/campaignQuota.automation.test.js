import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// Every message is paid from the wallet (subscription.service.js#
// consumeMessageCredit): a send with plan quota left is still charged, and a
// send the balance cannot cover is refused. The plan's usage counter keeps
// counting messages but no longer makes any of them free. Campaigns launched
// before this change may still hold a quota reservation, and settlement must
// keep releasing it exactly once — the last test pins that down.
process.env.DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/offline';
process.env.DIRECT_URL = process.env.DATABASE_URL;

let walletBalance = 0;
mock.module('./wallet.service.js', {
  namedExports: {
    LOW_BALANCE_MESSAGES: 100,
    walletStatus: () => ({}),
    getWallet: async () => ({ balance: walletBalance }),
    credit: async () => ({ ok: true }),
    debit: async (workspaceId, amount) => {
      if (walletBalance < amount) return { ok: false };
      walletBalance -= amount;
      return { ok: true, balance: walletBalance };
    },
    createTopupOrder: async () => ({}),
    verifyTopupPayment: async () => ({}),
    applyTopupPayment: async () => ({}),
    getWalletSummary: async () => ({}),
  },
});
mock.module('../queues/campaign.queue.js', { namedExports: { campaignQueue: { add: async () => ({ id: 'j' }) } } });

const { prisma } = await import('../lib/prisma.js');

const periodStart = new Date('2026-10-01T00:00:00Z');
const FREE = { key: 'FREE', name: 'Free', messageQuota: 100, overageRatePerMsg: 0.02, overageRates: null, features: {} };
let usage;
prisma.subscription.findUnique = async () => ({ workspaceId: 'ws', status: 'ACTIVE', plan: FREE, currentPeriodStart: periodStart, currentPeriodEnd: new Date('2026-10-31T00:00:00Z') });
prisma.usageCounter.upsert = async ({ update }) => { usage.messagesUsed += update?.messagesUsed?.increment ?? 0; return { ...usage }; };
prisma.usageCounter.findUnique = async () => ({ ...usage });
prisma.usageCounter.update = async ({ data }) => { usage.messagesUsed += data.messagesUsed?.increment ?? 0; return { ...usage }; };
prisma.usageCounter.updateMany = async ({ where, data }) => {
  const used = usage.messagesUsed;
  const m = where.messagesUsed;
  const ok = m === undefined
    || (typeof m === 'number' && used === m)
    || (typeof m === 'object' && (m.lt === undefined || used < m.lt) && (m.gte === undefined || used >= m.gte));
  if (!ok) return { count: 0 };
  if (data.messagesUsed?.increment !== undefined) usage.messagesUsed += data.messagesUsed.increment;
  else if (data.messagesUsed?.decrement !== undefined) usage.messagesUsed -= data.messagesUsed.decrement;
  else if (typeof data.messagesUsed === 'number') usage.messagesUsed = data.messagesUsed;
  return { count: 1 };
};
prisma.$transaction = async (fn) => fn(prisma);

const { consumeMessageCredit } = await import('./subscription.service.js');
const { reserveCampaignQuota } = await import('./campaignBilling.service.js');
const { settleCampaignRefund } = await import('./campaigns.service.js');

const automatedReply = () => consumeMessageCredit('ws', { reason: 'Automated reply' });

test('every send is charged to the wallet even while plan quota is left', async () => {
  usage = { workspaceId: 'ws', periodStart, messagesUsed: 3 };
  walletBalance = 1;
  const credit = await automatedReply();
  assert.equal(credit.ok, true);
  assert.equal(credit.source, 'WALLET');
  assert.equal(credit.amount, 0.02);
  assert.equal(walletBalance, 0.98);
  assert.equal(usage.messagesUsed, 4, 'the send still counts toward usage');
});

test('a send the wallet cannot cover is refused, and nothing is counted', async () => {
  usage = { workspaceId: 'ws', periodStart, messagesUsed: 0 };
  walletBalance = 0.01;
  const credit = await automatedReply();
  assert.equal(credit.ok, false);
  assert.equal(credit.code, 'QUOTA_AND_WALLET_EXHAUSTED');
  assert.equal(walletBalance, 0.01);
  assert.equal(usage.messagesUsed, 0);
});

test('a failed or completed campaign releases its unused reservation too', async () => {
  for (const status of ['FAILED', 'COMPLETED']) {
    usage = { workspaceId: 'ws', periodStart, messagesUsed: 0 };
    const { reserved } = await reserveCampaignQuota('ws', 50);
    assert.equal(reserved, 50);
    const campaign = {
      id: `c_${status}`, workspaceId: 'ws', name: status, status, chargedAt: new Date(),
      costPerMessage: 0.8, totalCost: 0, quotaUnits: 50, quotaPeriodStart: periodStart, quotaReleasedAt: null, refundedAt: null,
    };
    prisma.campaign.findUnique = async () => ({ ...campaign });
    prisma.campaign.updateMany = async ({ where, data }) => {
      if (where.quotaReleasedAt === null && campaign.quotaReleasedAt) return { count: 0 };
      Object.assign(campaign, data);
      return { count: 1 };
    };
    prisma.campaignRecipient.count = async ({ where }) => (where.billedAt ? 10 : 0);
    await settleCampaignRefund(campaign.id);
    assert.equal(usage.messagesUsed, 10, `${status}: only the 10 sent stay counted`);
  }
});
