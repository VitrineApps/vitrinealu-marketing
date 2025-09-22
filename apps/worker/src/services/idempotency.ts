import Redis from 'ioredis';
import { env } from '../config.js';

const redis = new Redis(env.REDIS_URL);

export function getIdempotencyKey(postId: string, action: string): string {
  return `idempotency:${postId}:${action}`;
}

export async function acquireLock(postId: string, action: string, ttlSeconds: number = 3600): Promise<boolean> {
  const key = getIdempotencyKey(postId, action);
  const result = await redis.set(key, 'locked', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function releaseLock(postId: string, action: string): Promise<void> {
  const key = getIdempotencyKey(postId, action);
  await redis.del(key);
}

export async function isLocked(postId: string, action: string): Promise<boolean> {
  const key = getIdempotencyKey(postId, action);
  const value = await redis.get(key);
  return value === 'locked';
}