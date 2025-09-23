import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { assemble } from '@vitrinealu/video-assembler';
import { VideoJobData, VideoJobResult } from './types';
import { loadConfig } from './config';
import logger from './logger';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

const config = loadConfig();

// Create Redis connection
const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
});

// Create video processing queue
export const videoQueue = new Queue<VideoJobData, VideoJobResult>('video-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: config.queue.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: config.queue.backoffDelay,
    },
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50,     // Keep last 50 failed jobs
  },
});

// Create worker
const worker = new Worker<VideoJobData, VideoJobResult>(
  'video-processing',
  async (job: Job<VideoJobData>) => {
    logger.info({ jobId: job.id }, 'Starting video processing job');
    
    try {
      // Update progress
      await job.updateProgress(10);
      
      // Process video with video-assembler
      const result = await assemble({
        profile: job.data.profile,
        clips: job.data.clips,
        captionJson: job.data.captionJson,
        watermarkPath: undefined, // Will be resolved from brand kit
        musicPath: job.data.musicPath,
        outPath: job.data.outPath,
        brandPath: job.data.brandPath,
        seed: job.data.seed,
      });
      
      await job.updateProgress(90);
      
      // Get file statistics
      const stats = statSync(result.outPath);
      
      await job.updateProgress(100);
      
      const jobResult: VideoJobResult = {
        jobId: job.id!,
        outPath: result.outPath,
        duration: result.duration,
        fileSize: stats.size,
        metadata: {
          profile: job.data.profile,
          clipCount: job.data.clips.length,
          hasMusic: !!job.data.musicPath,
          hasCaptions: !!job.data.captionJson,
          hasWatermark: !!job.data.brandPath, // Simplified check
        },
      };
      
      logger.info({ 
        jobId: job.id, 
        outPath: result.outPath,
        duration: result.duration,
        fileSize: stats.size 
      }, 'Video processing completed');
      
      return jobResult;
      
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Video processing failed');
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: config.queue.concurrency,
  }
);

// Worker event handlers
worker.on('completed', (job: Job<VideoJobData, VideoJobResult>) => {
  logger.info({ jobId: job.id }, 'Job completed successfully');
});

worker.on('failed', (job: Job<VideoJobData> | undefined, err: Error) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
});

worker.on('error', (err: Error) => {
  logger.error({ error: err.message }, 'Worker error');
});

// Queue event handlers
videoQueue.on('error', (err: Error) => {
  logger.error({ error: err.message }, 'Queue error');
});

/**
 * Add a video processing job to the queue
 */
export async function addVideoJob(
  profile: 'reel' | 'linkedin',
  data: Omit<VideoJobData, 'profile'>
): Promise<string> {
  const job = await videoQueue.add(
    `video-${profile}`,
    { profile, ...data },
    {
      priority: profile === 'reel' ? 1 : 2, // Reels have higher priority
    }
  );
  
  logger.info({ jobId: job.id, profile }, 'Video job added to queue');
  return job.id!;
}

/**
 * Get job status and result
 */
export async function getJobStatus(jobId: string) {
  const job = await videoQueue.getJob(jobId);
  
  if (!job) {
    return null;
  }
  
  const state = await job.getState();
  
  return {
    id: job.id!,
    status: state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue,
    error: job.failedReason,
    createdAt: new Date(job.timestamp),
    startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
    completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const waiting = await videoQueue.getWaiting();
  const active = await videoQueue.getActive();
  const completed = await videoQueue.getCompleted();
  const failed = await videoQueue.getFailed();
  
  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    total: waiting.length + active.length + completed.length + failed.length,
  };
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  logger.info('Closing video queue and worker');
  await worker.close();
  await videoQueue.close();
  await redis.disconnect();
}