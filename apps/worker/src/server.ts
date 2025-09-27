import cors from '@fastify/cors';
import fastify from 'fastify';

import { logger } from '@vitrinealu/shared/logger';
import { healthRoute } from './routes/health.js';
import { registerIngestRoutes } from './routes/api/ingest.js';

export const createServer = () => {
  const app = fastify({ logger: false }); // Disable logger

  app.register(cors, { origin: true });
  app.register(healthRoute);
  app.register(registerIngestRoutes);

  return app;
};
