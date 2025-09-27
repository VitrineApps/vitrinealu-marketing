import { FastifyInstance, FastifyReply } from 'fastify';
import { ZodSchema } from 'zod';
import { enqueueAndWait } from '../../lib/queue.js';
import {
  MediaJobResult,
  hashJobSchema,
  scoreJobSchema,
  enhanceJobSchema,
  privacyBlurJobSchema,
  backgroundCleanupJobSchema,
  reelJobSchema,
  linkedinJobSchema,
  captionJobSchema,
} from '../../jobs/types.js';

const parseOrReply = <T>(schema: ZodSchema<T>, payload: unknown, reply: FastifyReply): T | undefined => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    reply.status(400).send({
      error: 'Invalid payload',
      issues: result.error.flatten()
    });
    return undefined;
  }
  return result.data;
};

const ensureKind = <K extends MediaJobResult['kind']>(result: MediaJobResult, kind: K) => {
  if (result.kind !== kind) {
    throw new Error(`Unexpected job result kind ${result.kind}, expected ${kind}`);
  }
  return result as Extract<MediaJobResult, { kind: K }>;
};

export const registerMediaRoutes = async (app: FastifyInstance) => {
  app.post('/hash', async (request, reply) => {
    const body = parseOrReply(hashJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'hash' }), 'hash');
    return reply.status(200).send({ sha256: result.hash });
  });

  app.post('/score', async (request, reply) => {
    const body = parseOrReply(scoreJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'score' }), 'score');
    return reply.status(200).send({ score: result.score, isCandidate: result.isCandidate });
  });

  app.post('/enhance', async (request, reply) => {
    const body = parseOrReply(enhanceJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'enhance' }), 'enhance');
    return reply.status(200).send({ url: result.url, metadata: result.metadata });
  });

  app.post('/privacy/blur', async (request, reply) => {
    const body = parseOrReply(privacyBlurJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'privacyBlur' }), 'privacyBlur');
    return reply.status(200).send({ url: result.url });
  });

  app.post('/background/cleanup', async (request, reply) => {
    const body = parseOrReply(backgroundCleanupJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(
      await enqueueAndWait({ ...body, kind: 'backgroundCleanup', mode: body.mode ?? 'clean' }),
      'backgroundCleanup'
    );
    return reply.status(200).send({ url: result.url });
  });

  app.post('/video/reel', async (request, reply) => {
    const body = parseOrReply(reelJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'videoReel' }), 'videoReel');
    return reply.status(200).send({ mp4Url: result.mp4Url, thumbUrl: result.thumbUrl });
  });

  app.post('/video/linkedin', async (request, reply) => {
    const body = parseOrReply(linkedinJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'videoLinkedin' }), 'videoLinkedin');
    return reply.status(200).send({ mp4Url: result.mp4Url, thumbUrl: result.thumbUrl });
  });

  app.post('/caption', async (request, reply) => {
    const body = parseOrReply(captionJobSchema, request.body, reply);
    if (!body) return;
    const result = ensureKind(await enqueueAndWait({ ...body, kind: 'caption' }), 'caption');
    return reply.status(200).send({ caption: result.text, hashtags: result.hashtags });
  });

  // Buffer integration is now owned by Scheduler. This route is retired per Plan V2.
};
