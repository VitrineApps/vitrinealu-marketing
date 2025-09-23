import { createHmac } from 'node:crypto';
import { backgroundEvents, BackgroundJobSucceededEvent, BackgroundJobFailedEvent } from '../events/backgroundEvents.js';
import { logger } from '@vitrinealu/shared/logger';
import { env } from '../config.js';

const sendWebhook = async (url: string, payload: any, secret: string) => {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`
      },
      body
    });

    if (!response.ok) {
      logger.warn({ status: response.status, url }, 'Webhook failed');
    } else {
      logger.info({ url }, 'Webhook sent successfully');
    }
  } catch (error) {
    logger.error({ err: error, url }, 'Webhook send error');
  }
};

backgroundEvents.on('backgroundJobSucceeded', async (event: BackgroundJobSucceededEvent) => {
  if (!event.callbackUrl) return;

  const payload = {
    event: 'background.job.succeeded',
    jobId: event.jobId,
    mediaId: event.mediaId,
    projectId: event.projectId,
    outputUrl: event.outputUrl,
    timestamp: new Date().toISOString()
  };

  await sendWebhook(event.callbackUrl, payload, env.WEBHOOK_SECRET || 'default-secret');
});

backgroundEvents.on('backgroundJobFailed', async (event: BackgroundJobFailedEvent) => {
  if (!event.callbackUrl) return;

  const payload = {
    event: 'background.job.failed',
    jobId: event.jobId,
    mediaId: event.mediaId,
    projectId: event.projectId,
    error: event.error,
    timestamp: new Date().toISOString()
  };

  await sendWebhook(event.callbackUrl, payload, env.WEBHOOK_SECRET || 'default-secret');
});