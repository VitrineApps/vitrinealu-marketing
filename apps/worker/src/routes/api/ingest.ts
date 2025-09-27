import fs from 'node:fs/promises';
import path from 'node:path';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listNewFiles, markSeen } from '../../ingest/localIngest.js';
import { enqueueAndWait, redisAvailable } from '../../lib/queue.js';
import { driveHelpers } from '../../lib/drive.js';
import { logger } from '@vitrinealu/shared/logger';
import { MediaJobResult } from '../../jobs/types.js';

const enqueueSchema = z.object({
  paths: z.array(z.string())
});

export const registerIngestRoutes = async (app: FastifyInstance) => {
  app.get('/ingest/local/scan', async (request, reply) => {
    try {
      const files = await listNewFiles();
      const metadata = files.map(f => ({
        path: f.path,
        size: f.size,
        mtime: new Date(f.mtimeMs).toISOString()
      }));
      return reply.status(200).send(metadata);
    } catch (err) {
      logger.error({ err }, 'Failed to scan local ingest');
      return reply.status(500).send({ error: 'Failed to scan local ingest' });
    }
  });

  app.post('/ingest/local/enqueue', async (request, reply) => {
    const body = enqueueSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid payload',
        issues: body.error.flatten()
      });
    }

    if (!redisAvailable) {
      return reply.status(503).send({
        error: 'Job queue unavailable',
        message: 'Redis is not available. Please start Redis or use Docker Compose.',
        redisRequired: true
      });
    }

    const { paths } = body.data;
    const results = [];

    for (const filePath of paths) {
      try {
        // Upload file to drive
        const buffer = await fs.readFile(filePath);
        const fileName = path.basename(filePath);
        const upload = await driveHelpers.uploadFile({
          name: fileName,
          mimeType: 'image/jpeg', // Assume JPEG for now
          data: buffer,
          parents: [await driveHelpers.ensureSourcePath()]
        });

        const assetId = upload.id;

        // Enqueue enhance
        const enhanceResult = await enqueueAndWait({
          kind: 'enhance',
          assetId
        });

        // Enqueue background cleanup if enabled
        let backgroundResult = null;
        if (process.env.BACKGROUND_MODE !== 'disabled') {
          backgroundResult = await enqueueAndWait({
            kind: 'backgroundCleanup',
            fileId: (enhanceResult as Extract<MediaJobResult, { kind: 'enhance' }>).fileId,
            mode: 'clean'
          });
        }

        // Enqueue video jobs (reel and linkedin)
        const videoResults = [];
        const reelResult = await enqueueAndWait({
          kind: 'videoReel',
          assetIds: [assetId],
          music: 'cinematic'
        });
        videoResults.push(reelResult);

        const linkedinResult = await enqueueAndWait({
          kind: 'videoLinkedin',
          assetIds: [assetId],
          narration: 'Professional narration text'
        });
        videoResults.push(linkedinResult);

        // Enqueue caption jobs
        const captionResults = [];
        const platforms = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] as const;
        for (const platform of platforms) {
          const captionResult = await enqueueAndWait({
            kind: 'caption',
            context: { assetId, platform },
            channel: platform
          });
          captionResults.push({ platform, ...captionResult });
        }

        results.push({
          path: filePath,
          assetId,
          enhanceUrl: (enhanceResult as Extract<MediaJobResult, { kind: 'enhance' }>).url,
          backgroundUrl: backgroundResult ? (backgroundResult as Extract<MediaJobResult, { kind: 'backgroundCleanup' }>).url : undefined,
          videos: videoResults.map(r => ({
            mp4Url: (r as Extract<MediaJobResult, { kind: 'videoReel' | 'videoLinkedin' }>).mp4Url,
            thumbUrl: (r as Extract<MediaJobResult, { kind: 'videoReel' | 'videoLinkedin' }>).thumbUrl
          })),
          captions: captionResults
        });

        // Mark as seen
        const stat = await fs.stat(filePath);
        await markSeen([{ path: filePath, size: buffer.length, mtimeMs: stat.mtimeMs }]);

      } catch (err) {
        logger.error({ err, path: filePath }, 'Failed to process ingested file');
        results.push({
          path: filePath,
          error: err.message
        });
      }
    }

    return reply.status(200).send(results);
  });
};