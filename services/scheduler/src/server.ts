    // Carousel approval/rejection webhook
    this.app.post('/webhooks/approval/carousel/:id', async (req, res) => {
      const { id } = req.params;
      const { action, token } = req.query;
      if (!['approve', 'reject'].includes(String(action))) {
        return res.status(400).json({ error: 'Invalid action' });
      }
      // TODO: Validate token (HMAC or similar)
      try {
        const repo = this.repository;
        // Find carousel and Buffer draft ID
        const carousel = repo.db.prepare('SELECT * FROM carousels WHERE id = ?').get(id);
        if (!carousel) return res.status(404).json({ error: 'Carousel not found' });
        if (!carousel.buffer_draft_id) return res.status(400).json({ error: 'No Buffer draft for this carousel' });
        const buffer = new (await import('./bufferClient.js')).BufferClient();
        if (action === 'approve') {
          // Move Buffer draft to scheduled
          await buffer.scheduleDraft(carousel.buffer_draft_id);
          repo.db.prepare('UPDATE carousels SET status = ? WHERE id = ?').run('scheduled', id);
        } else {
          // Mark as rejected, optionally delete Buffer draft
          await buffer.deleteDraft(carousel.buffer_draft_id);
          repo.db.prepare('UPDATE carousels SET status = ? WHERE id = ?').run('rejected', id);
        }
        res.json({ ok: true });
      } catch (err) {
        logger.error('Carousel approval error:', err);
        res.status(500).json({ error: 'Failed to process approval' });
      }
    });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Repository } from './repository.js';
import { WeeklyPlanner } from './weeklyPlanner.js';
import { PlanningService } from './plan.js';
import { DigestGenerator } from './email/digest.js';
import { mailer } from './mailer.js';
import { config } from './config.js';
import { logger } from './logger.js';

// API request schemas
const WeeklyPlanRequestSchema = z.object({
  weekStart: z.string().datetime()
});

const ScheduleWeeklyPostsRequestSchema = z.object({
  weekStart: z.string().datetime()
});

const SendDigestRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  subject: z.string().optional()
});

export class SchedulerServer {
  private app: express.Application;
  private repository: Repository;
  private weeklyPlanner: WeeklyPlanner;
  private digestGenerator: DigestGenerator;

  constructor() {
    this.repository = new Repository();
    const planningService = new PlanningService();
    this.weeklyPlanner = new WeeklyPlanner(planningService, this.repository);
    this.digestGenerator = new DigestGenerator();
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: ['http://localhost:3000', 'http://localhost:5678'], // Allow n8n and local development
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Generate weekly plan
    this.app.post('/api/weekly-plan', async (req, res) => {
      try {
        const { weekStart } = WeeklyPlanRequestSchema.parse(req.body);
        const weekStartDate = new Date(weekStart);

        const plan = this.weeklyPlanner.generateWeeklyPlan(weekStartDate);

        res.json(plan);
      } catch (error) {
        logger.error('Error generating weekly plan:', error);
        res.status(400).json({ error: 'Invalid request or internal error' });
      }
    });

    // Schedule weekly posts
    this.app.post('/api/schedule-weekly-posts', async (req, res) => {
      try {
        const { weekStart } = ScheduleWeeklyPostsRequestSchema.parse(req.body);
        const weekStartDate = new Date(weekStart);

        const scheduledPosts = await this.weeklyPlanner.scheduleWeeklyPosts(weekStartDate);

        res.json(scheduledPosts);
      } catch (error) {
        logger.error('Error scheduling weekly posts:', error);
        res.status(500).json({ error: 'Failed to schedule posts' });
      }
    });

    // Send digest email
    this.app.post('/api/send-digest', async (req, res) => {
      try {
        const { startDate, endDate, subject } = SendDigestRequestSchema.parse(req.body);
        const start = new Date(startDate);
        const end = new Date(endDate);

        const posts = this.repository.getPostsForDigest(start, end);

        if (posts.length === 0) {
          return res.json({ message: 'No posts to send in digest' });
        }

        // Generate HTML digest
        const htmlDigest = this.digestGenerator.generateDigest(posts, start, end);

        // Send digest email
        const subjectLine = subject || this.digestGenerator.getSubjectLine(posts.length, start);
        await mailer.sendDigest(config.config.OWNER_EMAIL, subjectLine, htmlDigest);

        res.json({
          message: `Digest sent for ${posts.length} posts`,
          postCount: posts.length
        });
      } catch (error) {
        logger.error('Error sending digest:', error);
        res.status(500).json({ error: 'Failed to send digest' });
      }
    });

    // Get schedule configuration
    this.app.get('/api/schedule-config', (req, res) => {
      try {
        const scheduleConfig = this.weeklyPlanner.getScheduleConfig();
        res.json(scheduleConfig);
      } catch (error) {
        logger.error('Error getting schedule config:', error);
        res.status(500).json({ error: 'Failed to get schedule configuration' });
      }
    });

    // Validate schedule configuration
    this.app.get('/api/validate-config', (req, res) => {
      try {
        const validation = this.weeklyPlanner.validateConfiguration();
        res.json(validation);
      } catch (error) {
        logger.error('Error validating config:', error);
        res.status(500).json({ error: 'Failed to validate configuration' });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  public start(port: number = 8787): void {
    this.app.listen(port, () => {
      logger.info(`Scheduler API server listening on port ${port}`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public close(): void {
    this.repository.close();
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SchedulerServer();
  const port = parseInt(process.env.PORT || '8787');
  server.start(port);
}