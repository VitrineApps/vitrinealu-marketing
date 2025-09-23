import { logger } from '@vitrinealu/shared/logger';

import { env } from './config.js';
import { createServer } from './server.js';
import './lib/queue.js';
import './webhooks/background.js';

const start = async () => {
  const app = createServer();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    logger.info({ port, host, timezone: env.TIMEZONE }, 'Worker server started');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start worker server');
    process.exit(1);
  }
};

void start();
