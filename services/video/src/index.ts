import express from 'express';
import pino from 'pino';
import { fileURLToPath } from 'url';

import { loadConfig } from './config.js';
import { VideoOrchestrator } from './orchestrator.js';
import { SoraAzureAdapter, RunwayAdapter, PikaAdapter, FfmpegAdapter } from './adapters/index.js';
import { VideoRequest } from './types.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export function createServer() {
  const config = loadConfig();
  const adapters = [
    new SoraAzureAdapter(config),
    new RunwayAdapter(config),
    new PikaAdapter(config),
    new FfmpegAdapter(config),
  ];
  const orchestrator = new VideoOrchestrator(config, adapters);

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/video/generate', async (req, res, next) => {
    const body = req.body as VideoRequest;
    if (!body || typeof body.assetId !== 'string' || !body.assetId.trim()) {
      res.status(400).json({ error: 'assetId is required' });
      return;
    }
    try {
      const result = await orchestrator.generate(body);
      res.json({
        backend: result.backend,
        duration: result.duration,
        filePath: result.filePath,
        outputUrl: result.outputUrl,
        metadata: result.metadata ?? {},
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, 'video generation failed');
    res.status(500).json({ error: message });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? '8080');
  const app = createServer();
  app.listen(port, () => {
    logger.info({ port }, 'video service listening');
  });
}
