import type { FastifyInstance } from 'fastify';
import { mediaQueue } from '../lib/queue.js';
import { env } from '../config.js';
import { fetch } from 'undici';

export const healthRoute = async (app: FastifyInstance) => {
  app.get('/healthz', async () => {
    const checks: Record<string, unknown> = {};
    let healthy = true;

    // Queue check
    try {
      if (!mediaQueue) {
        healthy = false;
        checks.queue = { status: 'error: Queue not available' };
      } else {
        const [waiting, active, completed] = await Promise.all([
          mediaQueue.getWaitingCount(),
          mediaQueue.getActiveCount(),
          mediaQueue.getCompletedCount()
        ]);
        checks.queue = { waiting, active, completed, status: 'ok' };
      }
    } catch (e) {
      healthy = false;
      checks.queue = { status: `error: ${(e as Error).message}` };
    }

    // DB check (Supabase)
    try {
      const supabase = (await import('../lib/supabase.js')).getSupabase();
      await supabase.from('worker_operations').select('count').limit(1);
      checks.db = 'ok';
    } catch (e) {
      healthy = false;
      checks.db = `error: ${(e as Error).message}`;
    }

    // Redis check
    try {
      const redis = (await import('ioredis')).default;
      const client = new redis(env.REDIS_URL);
      await client.ping();
      await client.quit();
      checks.redis = 'ok';
    } catch (e) {
      healthy = false;
      checks.redis = `error: ${(e as Error).message}`;
    }

    // Enhance FastAPI check
    try {
      const response = await fetch(`${env.ENHANCE_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        checks.enhanceApi = 'ok';
      } else {
        healthy = false;
        checks.enhanceApi = `error: HTTP ${response.status}`;
      }
    } catch (e) {
      healthy = false;
      checks.enhanceApi = `error: ${(e as Error).message}`;
    }

    // Buffer API check (if token available)
    if (env.BUFFER_ACCESS_TOKEN) {
      try {
        const response = await fetch('https://api.buffer.com/2/profiles.json', {
          headers: { 'Authorization': `Bearer ${env.BUFFER_ACCESS_TOKEN}` },
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
          checks.bufferApi = 'ok';
        } else {
          checks.bufferApi = `error: HTTP ${response.status}`;
        }
      } catch (e) {
        checks.bufferApi = `error: ${(e as Error).message}`;
      }
    } else {
      checks.bufferApi = 'not configured';
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    };
  });
};
