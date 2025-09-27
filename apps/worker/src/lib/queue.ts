import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config.js';
import { MediaJobData, MediaJobResult } from '../jobs/types.js';
import { processMediaJob } from '../jobs/processor.js';
import { logger } from '@vitrinealu/shared/logger';

// Redis connection with error handling
let connection: IORedis | null = null;
let mediaQueue: Queue<MediaJobData> | null = null;
let mediaQueueEvents: QueueEvents | null = null;
let worker: Worker<MediaJobData, MediaJobResult> | null = null;
let redisAvailable = false;

const initializeRedis = async () => {
  try {
    connection = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 5000, // 5 second timeout
      commandTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    // Handle connection errors to prevent unhandled exceptions
    connection.on('error', (error) => {
      // Silently handle connection errors - don't log when in limited mode
      if (!redisAvailable) {
        return;
      }
      logger.debug({ err: error }, 'Redis connection error');
    });

    connection.on('connect', () => {
      logger.debug('Redis connected');
    });

    connection.on('ready', () => {
      logger.debug('Redis ready');
    });    // Test connection with timeout
    await Promise.race([
      connection.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
      )
    ]);
    redisAvailable = true;

    mediaQueue = new Queue<MediaJobData>('media-jobs', { connection });
    mediaQueueEvents = new QueueEvents('media-jobs', { connection });

    worker = new Worker<MediaJobData, MediaJobResult>(
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

    logger.info('Redis connection established successfully');
  } catch (error) {
    logger.warn({ err: error }, 'Redis connection failed - running in limited mode');
    redisAvailable = false;
    
    // If connection failed, set up error handler for any future connection attempts
    if (connection) {
      connection.on('error', () => {
        // Ignore errors in limited mode
      });
    }
  }
};

// Initialize Redis asynchronously
// initializeRedis();

export { redisAvailable, mediaQueue };

export const enqueueAndWait = async <T extends MediaJobResult>(data: MediaJobData): Promise<T> => {
  if (!redisAvailable || !mediaQueue || !mediaQueueEvents) {
    throw new Error('Redis is not available - cannot enqueue jobs');
  }

  const job = await mediaQueue.add(data.kind, data, {
    removeOnComplete: true,
    removeOnFail: false
  });
  const result = await job.waitUntilFinished(mediaQueueEvents);
  return result as T;
};
