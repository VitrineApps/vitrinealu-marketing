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

    // Enhance FastAPI check
    try {
      const enhanceUrl = process.env.ENHANCE_SERVICE_URL || 'http://localhost:8000';
      const response = await fetch(`${enhanceUrl}/health`, {
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
