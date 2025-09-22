import { FastifyInstance } from 'fastify';
import { verify, type ApprovalPayload } from '@vitrinealu/shared';
import { env } from '../../config.js';

export const registerApprovalRoutes = async (app: FastifyInstance) => {
  app.post('/verify', async (request, reply) => {
    const { token, payload } = request.body as { token: string; payload: ApprovalPayload };
    if (!token || !payload) {
      return reply.status(400).send({ error: 'Missing token or payload' });
    }

    // Check expiration
    if (payload.exp && payload.exp < Date.now()) {
      return reply.status(400).send({ error: 'Token expired' });
    }

    const isValid = verify(token, payload, env.APPROVAL_SECRET || 'default-secret');
    if (!isValid) {
      return reply.status(400).send({ error: 'Invalid token' });
    }

    return reply.status(200).send({ valid: true, payload });
  });

  app.post('/idempotency/release', async (request, reply) => {
    const { postId, action } = request.body as { postId: string; action: string };
    if (!postId || !action) {
      return reply.status(400).send({ error: 'Missing postId or action' });
    }

    const { releaseLock } = await import('../../services/idempotency.js');
    await releaseLock(postId, action);

    return reply.status(200).send({ released: true });
  });
};