import { Router, Request, Response } from 'express';
import { Repository } from './repository.js';
import { BufferClient } from './integrations/bufferClient.js';
import { logger } from './logger.js';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/healthz', async (req: Request, res: Response) => {
    const checks: Record<string, any> = {};
    let healthy = true;

    // DB check
    try {
      const repo = new Repository();
      repo.listPostsByStatus('DRAFT', 1);
      checks.db = 'ok';
    } catch (e) {
      healthy = false;
      checks.db = `error: ${(e as Error).message}`;
    }

    // Buffer API check
    try {
      const bufferClient = new BufferClient(process.env.BUFFER_ACCESS_TOKEN || '', {});
      await bufferClient.getProfiles();
      checks.bufferApi = 'ok';
    } catch (e) {
      healthy = false;
      checks.bufferApi = `error: ${(e as Error).message}`;
    }

    // Redis check (if used)
    // checks.redis = 'ok'; // Add if Redis is part of infra

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
