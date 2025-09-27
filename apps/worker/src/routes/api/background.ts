import { FastifyInstance, FastifyReply } from 'fastify';
import { backgroundReplaceJobSchema, MediaJobData } from '../../jobs/types.js';
import { z } from 'zod';
import { mediaQueue } from '../../lib/queue.js';

const parseOrReply = <T extends z.ZodTypeAny>(schema: T, payload: unknown, reply: FastifyReply): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    reply.status(400).send({
      error: 'Invalid payload',
      issues: result.error.flatten()
    });
    throw new Error('Invalid payload');
  }
  return result.data;
};

export const registerBackgroundRoutes = async (app: FastifyInstance) => {
  app.post('/background/replace', async (request, reply) => {
    try {
      const body = parseOrReply(backgroundReplaceJobSchema, request.body, reply);

      const jobData = {
        kind: 'backgroundReplace' as const,
        ...(body as Record<string, unknown>)
      } as MediaJobData;

      // Check if queue is available
      if (!mediaQueue) {
        return reply.status(503).send({ error: 'Job queue is not available' });
      }

      // Enqueue job
      const job = await mediaQueue.add('backgroundReplace', jobData, {
        removeOnComplete: true,
        removeOnFail: false
      });

      return reply.status(202).send({ jobId: job.id });
    } catch (error) {
      // Error already sent by parseOrReply
      return;
    }
  });
};