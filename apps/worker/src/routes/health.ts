import type { FastifyInstance } from 'fastify';
import { mediaQueue } from '../lib/queue.js';

export const healthRoute = async (app: FastifyInstance) => {
  app.get('/healthz', async () => {
    const [waiting, active, completed] = await Promise.all([
      mediaQueue.getWaitingCount(),
      mediaQueue.getActiveCount(),
      mediaQueue.getCompletedCount()
    ]);
    return {
      status: 'ok',
      queue: { waiting, active, completed }
    };
  });
};
