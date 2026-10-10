import { Worker } from 'bullmq';
import { createBullConnection, logRedisError } from '../lib/redis.js';
import { env } from '../config/env.js';
import { processCampaign } from '../services/emailCampaigns.service.js';

// One campaign at a time: they all share one SMTP account, and Gmail throttles
// an account that sends in parallel bursts.
export function startEmailCampaignWorker() {
  const worker = new Worker('email-campaigns', (job) => processCampaign(job.data.campaignId), {
    connection: createBullConnection('email-campaign-worker'),
    concurrency: 1,
    // A long list takes minutes; keep the lock alive well past one batch.
    lockDuration: 120_000,
    drainDelay: env.WORKER_DRAIN_DELAY_SEC,
    stalledInterval: env.WORKER_STALLED_INTERVAL_MS,
  });

  worker.on('error', (err) => logRedisError('email-campaign-worker', err));
  worker.on('completed', (job) => console.log(`[EmailCampaignWorker] Campaign ${job.data.campaignId} finished`));
  worker.on('failed', (job, err) => console.error(`[EmailCampaignWorker] Campaign ${job?.data?.campaignId} failed:`, err.message));

  return worker;
}
