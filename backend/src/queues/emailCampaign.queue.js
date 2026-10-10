import { Queue } from 'bullmq';
import { createQueueConnection, logRedisError } from '../lib/redis.js';

// One job per email campaign; the job walks the campaign's PENDING recipients.
// A scheduled campaign is the same job with a delay.
export const emailCampaignQueue = new Queue('email-campaigns', {
  connection: createQueueConnection('email-campaign-queue'),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

emailCampaignQueue.on('error', (err) => logRedisError('email-campaign-queue', err));

// The job id is the campaign id, so queueing a campaign whose job is still
// waiting or running (a restart recovering it) is a no-op. A finished job of
// the same id is cleared first, or BullMQ would silently ignore the new one.
export async function enqueueEmailCampaign(campaignId, delayMs = 0) {
  const jobId = `email-campaign-${campaignId}`;
  const existing = await emailCampaignQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed') return existing;
    await existing.remove();
  }
  return emailCampaignQueue.add('send', { campaignId }, { jobId, delay: Math.max(0, delayMs) });
}
