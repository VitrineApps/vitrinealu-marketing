import cors from '@fastify/cors';
import fastify from 'fastify';

import { logger } from '@vitrinealu/shared/logger';
import { healthRoute } from './routes/health.js';
import { registerMediaRoutes } from './routes/api/media.js';
import { registerApprovalRoutes } from './routes/api/approvals.js';
import { registerBackgroundRoutes } from './routes/api/background.js';
import { registerDigestRoutes } from './routes/api/digest.js';
import { registerMetricsRoutes } from './routes/api/metrics.js';

export const createServer = () => {
  const app = fastify({ logger });

  app.register(cors, { origin: true });
  app.register(healthRoute);
  app.register(registerMediaRoutes);
  app.register(registerApprovalRoutes);
  app.register(registerBackgroundRoutes);
  app.register(registerDigestRoutes);
  app.register(registerMetricsRoutes);

  return app;
};
