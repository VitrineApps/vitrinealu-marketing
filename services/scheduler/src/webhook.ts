import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { z } from 'zod';
import { Repository } from './repository.js';
import { config } from './config.js';
import { logger } from './logger.js';

// Webhook payload schema
const ApprovalWebhookSchema = z.object({
  postId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  approvedBy: z.string().min(1),
  notes: z.string().optional()
});

type ApprovalWebhook = z.infer<typeof ApprovalWebhookSchema>;

export class WebhookServer {
  private app: express.Application;
  private repository: Repository;

  constructor(repository: Repository) {
    this.repository = repository;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: config.webhookConfig.allowedOrigins,
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
    this.app.use('/webhooks', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Approval webhook endpoint
    this.app.post('/webhooks/approval', this.handleApprovalWebhook.bind(this));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Webhook server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private async handleApprovalWebhook(req: express.Request, res: express.Response): Promise<void> {
    try {
      // Verify webhook signature
      const signature = req.headers['x-webhook-signature'] as string;
      if (!signature) {
        logger.warn('Missing webhook signature');
        res.status(401).json({ error: 'Missing signature' });
        return;
      }

      const isValidSignature = this.verifySignature(JSON.stringify(req.body), signature);
      if (!isValidSignature) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Validate payload
      const validationResult = ApprovalWebhookSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn('Invalid webhook payload:', validationResult.error);
        res.status(400).json({ error: 'Invalid payload', details: validationResult.error.issues });
        return;
      }

      const webhookData: ApprovalWebhook = validationResult.data;

      // Check if post exists and is in draft status
      const post = this.repository.getPost(webhookData.postId);
      if (!post) {
        logger.warn(`Post not found: ${webhookData.postId}`);
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      if (post.status !== 'draft') {
        logger.warn(`Post ${webhookData.postId} is not in draft status: ${post.status}`);
        res.status(400).json({ error: 'Post is not in draft status' });
        return;
      }

      // Create approval record
      const approval = this.repository.createApproval({
        postId: webhookData.postId,
        action: webhookData.action === 'approve' ? 'approved' : 'rejected',
        approvedBy: webhookData.approvedBy,
        notes: webhookData.notes
      });

      // Update post status
      const newStatus = webhookData.action === 'approve' ? 'approved' : 'rejected';
      this.repository.updatePostStatus(webhookData.postId, newStatus);

      logger.info(`Post ${webhookData.postId} ${newStatus} by ${webhookData.approvedBy}`);

      res.json({
        success: true,
        postId: webhookData.postId,
        action: approval.action,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt.toISOString()
      });

    } catch (error) {
      logger.error('Error processing approval webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private verifySignature(payload: string, signature: string): boolean {
    const secret = config.webhookConfig.secret;
    if (!secret) {
      logger.error('Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  public start(port: number = 3000): void {
    this.app.listen(port, () => {
      logger.info(`Webhook server listening on port ${port}`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}