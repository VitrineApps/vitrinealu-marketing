import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config.js';
import { MediaJobData, MediaJobResult } from '../jobs/types.js';
import { processMediaJob } from '../jobs/processor.js';
import { logger } from '@vitrinealu/shared/logger';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const mediaQueue = new Queue<MediaJobData>('media-jobs', { connection });
const mediaQueueEvents = new QueueEvents('media-jobs', { connection });

const worker = new Worker<MediaJobData, MediaJobResult>(
  'media-jobs',
  async (job: Job<MediaJobData>): Promise<MediaJobResult> => {
    logger.info({ jobId: job.id, kind: job.data.kind }, 'Processing media job');
    const result = await processMediaJob(job.data);
    logger.info({ jobId: job.id, kind: job.data.kind }, 'Media job processed');
    return result;
  },
  { connection }
);

worker.on('error', (error) => {
  logger.error({ err: error }, 'Media worker encountered an error');
});

export const enqueueAndWait = async <T extends MediaJobResult>(data: MediaJobData): Promise<T> => {
  const job = await mediaQueue.add(data.kind, data, {
    removeOnComplete: true,
    removeOnFail: false
  });
  const result = await job.waitUntilFinished(mediaQueueEvents);
  return result as T;
};
