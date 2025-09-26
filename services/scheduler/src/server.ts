import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { Repository, Post } from './repository.js';
import { WeeklyPlanner } from './weeklyPlanner.js';
import { PlanningService } from './plan.js';
import { DigestGenerator } from './email/digest.js';
import { MetricsHarvester } from './metrics/harvester.js';
import { mailer } from './mailer.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { BufferClient, ValidationError as BufferValidationError, ApiError as BufferApiError } from './bufferClient.js';

const WeeklyPlanRequestSchema = z.object({
  weekStart: z.string().datetime(),
});

const ScheduleWeeklyPostsRequestSchema = z.object({
  weekStart: z.string().datetime(),
});

const SendDigestRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  subject: z.string().optional(),
});

const MetricsRequestSchema = z.object({
  days: z.number().min(1).max(365).optional().default(30),
});

const DraftRequestSchema = z.object({
  assetId: z.string(),
  platforms: z.array(z.string()).min(1),
  caption: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
  thumbnailUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime(),
  bufferDraftId: z.string().optional(),
});

const DigestRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const ApprovalQuerySchema = z.object({
  postId: z.string(),
  assetId: z.string().optional(),
  ts: z.string(),
  signature: z.string(),
});

export class SchedulerServer {
  private app: express.Application;
  private repository: Repository;
  private weeklyPlanner: WeeklyPlanner;
  private digestGenerator: DigestGenerator;
  private metricsHarvester: MetricsHarvester;
  private bufferClient: BufferClient;

  constructor() {
    this.repository = new Repository();
    const planningService = new PlanningService();
    this.weeklyPlanner = new WeeklyPlanner(planningService, this.repository);
    this.digestGenerator = new DigestGenerator();
    this.metricsHarvester = new MetricsHarvester();
    this.bufferClient = new BufferClient();
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors({
      origin: ['http://localhost:3000', 'http://localhost:5678'],
      credentials: true,
    }));
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Metrics endpoints
    this.app.post('/api/metrics/harvest', async (req, res) => {
      try {
        const report = await this.metricsHarvester.harvestWeeklyMetrics();
        res.json(report);
      } catch (error) {
        logger.error('Error harvesting metrics:', error);
        res.status(500).json({ error: 'Failed to harvest metrics' });
      }
    });

    this.app.get('/api/metrics/historical', (req, res) => {
      try {
        const { days } = MetricsRequestSchema.parse(req.query);
        const metrics = this.metricsHarvester.getHistoricalMetrics(days);
        res.json({ metrics, count: metrics.length });
      } catch (error) {
        logger.error('Error getting historical metrics:', error);
        res.status(400).json({ error: 'Invalid request or internal error' });
      }
    });

    this.app.post('/api/metrics/post/:postId', async (req, res) => {
      try {
        const { postId } = req.params;
        const metrics = await this.metricsHarvester.harvestPostMetrics(postId);
        if (!metrics) {
          res.status(404).json({ error: 'Post not found or no metrics available' });
          return;
        }
        res.json(metrics);
      } catch (error) {
        logger.error('Error harvesting post metrics:', error);
        res.status(500).json({ error: 'Failed to harvest post metrics' });
      }
    });

    this.app.post('/api/weekly-plan', async (req, res) => {
      try {
        const { weekStart } = WeeklyPlanRequestSchema.parse(req.body);
        const plan = this.weeklyPlanner.generateWeeklyPlan(new Date(weekStart));
        res.json(plan);
      } catch (error) {
        logger.error('Error generating weekly plan:', error);
        res.status(400).json({ error: 'Invalid request or internal error' });
      }
    });

    this.app.post('/api/schedule-weekly-posts', async (req, res) => {
      try {
        const { weekStart } = ScheduleWeeklyPostsRequestSchema.parse(req.body);
        const scheduledPosts = await this.weeklyPlanner.scheduleWeeklyPosts(new Date(weekStart));
        res.json(scheduledPosts.map((post) => this.serializePost(post)));
      } catch (error) {
        logger.error('Error scheduling weekly posts:', error);
        res.status(500).json({ error: 'Failed to schedule posts' });
      }
    });

    this.app.post('/api/drafts', async (req, res) => {
      try {
        const payload = DraftRequestSchema.parse(req.body);
        const scheduledAt = new Date(payload.scheduledAt);
        const posts: Post[] = [];
        const bufferDraftId = payload.bufferDraftId ?? null;

        for (const platform of payload.platforms) {
          const post = this.repository.insertPost({
            id: randomUUID(),
            assetId: payload.assetId,
            platform,
            status: bufferDraftId ? 'pending_approval' : 'draft',
            bufferDraftId,
            caption: payload.caption,
            hashtags: payload.hashtags,
            thumbnailUrl: payload.thumbnailUrl ?? null,
            scheduledAt,
          });
          posts.push(post);
        }

        res.status(201).json({ posts: posts.map((post) => this.serializePost(post)) });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: error.message });
          return;
        }
        logger.error('Error creating drafts:', error);
        res.status(500).json({ error: 'Failed to create drafts' });
      }
    });

    this.app.get('/api/posts/pending', (req, res) => {
      const limit = Number(req.query.limit ?? '50');
      const posts = this.repository.listPostsByStatus('pending_approval', Number.isFinite(limit) ? limit : 50);
      res.json({ posts: posts.map((post) => this.serializePost(post)) });
    });

    this.app.post('/api/digest', (req, res) => {
      try {
        const { startDate, endDate } = DigestRequestSchema.parse(req.body);
        const start = new Date(startDate);
        const end = new Date(endDate);
        const posts = this.repository.getPostsForDigest(start, end);
        const html = this.digestGenerator.generateDigest(posts, start, end);
        const text = this.digestGenerator.generateTextDigest(posts, start, end);
        res.json({ html, text, count: posts.length });
      } catch (error) {
        logger.error('Error building digest:', error);
        res.status(400).json({ error: 'Invalid request' });
      }
    });

    this.app.post('/api/send-digest', async (req, res) => {
      try {
        const { startDate, endDate, subject } = SendDigestRequestSchema.parse(req.body);
        const start = new Date(startDate);
        const end = new Date(endDate);
        const posts = this.repository.getPostsForDigest(start, end);

        if (posts.length === 0) {
          res.json({ message: 'No posts to send in digest' });
          return;
        }

        const htmlDigest = this.digestGenerator.generateDigest(posts, start, end);
        const subjectLine = subject || this.digestGenerator.getSubjectLine(posts.length, start);
        await mailer.sendDigest(config.config.OWNER_EMAIL, subjectLine, htmlDigest);

        res.json({ message: 'Digest sent for ' + String(posts.length) + ' posts', postCount: posts.length });
      } catch (error) {
        logger.error('Error sending digest:', error);
        res.status(500).json({ error: 'Failed to send digest' });
      }
    });

    this.app.post('/webhooks/approve', this.handleApproval('approve'));
    this.app.post('/webhooks/reject', this.handleApproval('reject'));

    this.app.get('/api/schedule-config', (_req, res) => {
      try {
        const scheduleConfig = this.weeklyPlanner.getScheduleConfig();
        res.json(scheduleConfig);
      } catch (error) {
        logger.error('Error getting schedule config:', error);
        res.status(500).json({ error: 'Failed to get schedule configuration' });
      }
    });

    this.app.get('/api/validate-config', (_req, res) => {
      try {
        const validation = this.weeklyPlanner.validateConfiguration();
        res.json(validation);
      } catch (error) {
        logger.error('Error validating config:', error);
        res.status(500).json({ error: 'Failed to validate configuration' });
      }
    });

    this.app.use('*', (_req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    this.app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private handleApproval(action: 'approve' | 'reject') {
    return async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const query = ApprovalQuerySchema.parse(req.query);
        const valid = config.verifyApprovalPayload({
          postId: query.postId,
          action,
          assetId: query.assetId,
          timestamp: query.ts,
          signature: query.signature,
          maxAgeMs: 1000 * 60 * 60 * 24 * 7,
        });
        if (!valid) {
          res.status(403).json({ error: 'Invalid or expired signature' });
          return;
        }

        const post = this.repository.getPostById(query.postId);
        if (!post) {
          res.status(404).json({ error: 'Post not found' });
          return;
        }

        try {
          if (action === 'approve') {
            if (post.bufferDraftId) {
              await this.bufferClient.scheduleDraft(post.bufferDraftId);
            }
            this.repository.updatePostStatus(post.id, 'approved');
          } else {
            if (post.bufferDraftId) {
              await this.bufferClient.deleteDraft(post.bufferDraftId);
            }
            this.repository.updatePostStatus(post.id, 'rejected', null);
          }
          this.repository.recordApproval(post.id, action, 'owner');
          res.json({ ok: true });
        } catch (err) {
          if (err instanceof BufferApiError || err instanceof BufferValidationError) {
            logger.error('Buffer action failed for post ' + post.id + ': ' + err.message);
            res.status(502).json({ error: err.message });
            return;
          }
          throw err;
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: error.message });
          return;
        }
        logger.error('Approval webhook error:', error);
        res.status(500).json({ error: 'Failed to process approval' });
      }
    };
  }

  private serializePost(post: Post) {
    return {
      ...post,
      scheduledAt: post.scheduledAt.toISOString(),
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  public start(port: number = 8787): void {
    this.app.listen(port, () => {
      logger.info('Scheduler API server listening on port ' + port);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public close(): void {
    this.repository.close();
    this.metricsHarvester.close();
  }
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const server = new SchedulerServer();
  const port = parseInt(process.env.PORT || '8787', 10);
  server.start(port);
}
