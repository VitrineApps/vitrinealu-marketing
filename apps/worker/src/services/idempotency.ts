import Redis from 'ioredis';
import { env } from '../config.js';
import { logger } from '@vitrinealu/shared/logger';

let redis: Redis | null = null;
let redisAvailable = false;

// Temporarily disable Redis
// try {
//   redis = new Redis(env.REDIS_URL, {
//     lazyConnect: true,
//     connectTimeout: 5000,
//     commandTimeout: 5000,
//     maxRetriesPerRequest: 1,
//   });

//   // Handle connection errors
//   redis.on('error', (error) => {
//     if (!redisAvailable) return; // Ignore errors when not connected
//     logger.debug({ err: error }, 'Idempotency Redis connection error');
//   });

//   redis.on('connect', () => {
//     redisAvailable = true;
//     logger.debug('Idempotency Redis connected');
//   });

//   redis.on('ready', () => {
//     logger.debug('Idempotency Redis ready');
//   });

// } catch (error) {
//   logger.warn({ err: error }, 'Idempotency Redis initialization failed');
//   redisAvailable = false;
// }

export function getIdempotencyKey(postId: string, action: string): string {
  return `idempotency:${postId}:${action}`;
}

export async function acquireLock(postId: string, action: string, ttlSeconds: number = 3600): Promise<boolean> {
  if (!redis || !redisAvailable) {
    logger.debug('Redis not available for idempotency lock');
    return true; // Allow operation when Redis is not available
  }
  try {
    const key = getIdempotencyKey(postId, action);
    const result = await redis.set(key, 'locked', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (error) {
    logger.warn({ err: error }, 'Failed to acquire idempotency lock');
    return true; // Allow operation on error
  }
}

export async function releaseLock(postId: string, action: string): Promise<void> {
  if (!redis || !redisAvailable) {
    return; // Silently ignore when Redis is not available
  }
  try {
    const key = getIdempotencyKey(postId, action);
    await redis.del(key);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to release idempotency lock');
  }
}

export async function isLocked(postId: string, action: string): Promise<boolean> {
  if (!redis || !redisAvailable) {
    return false; // Not locked when Redis is not available
  }
  try {
    const key = getIdempotencyKey(postId, action);
    const value = await redis.get(key);
    return value === 'locked';
  } catch (error) {
    logger.warn({ err: error }, 'Failed to check idempotency lock');
    return false; // Not locked on error
  }
}