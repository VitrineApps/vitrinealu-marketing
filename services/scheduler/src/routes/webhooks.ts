import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Repository } from '../repository.js';
import { Publisher } from '../services/publisher.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

// HMAC validation schema
const ApprovalQuerySchema = z.object({
  postId: z.string().uuid('Invalid post ID format'),
  ts: z.string().regex(/^\d+$/, 'Invalid timestamp format'),
  sig: z.string().min(1, 'Signature is required'),
});

const RejectionQuerySchema = z.object({
  postId: z.string().uuid('Invalid post ID format'),
  ts: z.string().regex(/^\d+$/, 'Invalid timestamp format'),
  sig: z.string().min(1, 'Signature is required'),
});

interface WebhookContext {
  repository: Repository;
  publisher: Publisher;
}

/**
 * Create HMAC signature for approval/rejection URLs
 */
export function createApprovalSignature(postId: string, action: 'approve' | 'reject', timestamp: number): string {
  const message = `${timestamp}|${postId}|${action}`;
  const secret = process.env.APPROVAL_HMAC_SECRET;
  if (!secret) {
    throw new Error('APPROVAL_HMAC_SECRET environment variable is required');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');
}

/**
 * Verify HMAC signature for approval/rejection requests
 */
function verifyApprovalSignature(
  postId: string, 
  action: 'approve' | 'reject', 
  timestamp: number, 
  signature: string
): boolean {
  try {
    const expectedSignature = createApprovalSignature(postId, action, timestamp);
    
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    logger.warn({ 
      postId, 
      action, 
      timestamp, 
      error: error instanceof Error ? error.message : error 
    }, 'Failed to verify signature');
    return false;
  }
}

/**
 * Check if timestamp is within acceptable window (prevents replay attacks)
 */
function isTimestampValid(timestamp: number, windowMinutes: number = 60): boolean {
  const now = Date.now();
  const timestampMs = timestamp * 1000; // Convert to milliseconds
  const windowMs = windowMinutes * 60 * 1000;
  
  // Check if timestamp is within the past window (allow some future tolerance for clock skew)
  return Math.abs(now - timestampMs) <= windowMs;
}

/**
 * Rate limiting map for approval actions (postId -> last action timestamp)
 * Prevents rapid-fire approval/rejection attempts
 */
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 30 * 1000; // 30 seconds

function isRateLimited(postId: string): boolean {
  const lastAction = rateLimitMap.get(postId);
  const now = Date.now();
  
  if (lastAction && (now - lastAction) < RATE_LIMIT_WINDOW_MS) {
    return true;
  }
  
  rateLimitMap.set(postId, now);
  
  // Cleanup old entries periodically
  if (rateLimitMap.size > 1000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;
    for (const [key, timestamp] of rateLimitMap.entries()) {
      if (timestamp < cutoff) {
        rateLimitMap.delete(key);
      }
    }
  }
  
  return false;
}

/**
 * Create webhook routes for approval/rejection handling
 */
export function createWebhookRoutes(context: WebhookContext): Router {
  const router = Router();

  /**
   * POST /webhooks/approve?postId=...&ts=...&sig=...
   * Approve a post and trigger Buffer publication
   */
  router.post('/approve', async (req: Request, res: Response) => {
    try {
      // Validate query parameters
      const validationResult = ApprovalQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        logger.warn({ 
          query: req.query, 
          errors: validationResult.error.issues 
        }, 'Invalid approval request parameters');
        
        return res.status(400).json({
          error: 'Invalid parameters',
          details: validationResult.error.issues,
        });
      }

      const { postId, ts, sig } = validationResult.data;
      const timestamp = parseInt(ts, 10);

      // Check timestamp validity (prevents replay attacks)
      if (!isTimestampValid(timestamp)) {
        logger.warn({ postId, timestamp }, 'Approval request timestamp is too old or too far in future');
        return res.status(400).json({ error: 'Request timestamp is invalid or expired' });
      }

      // Verify HMAC signature
      if (!verifyApprovalSignature(postId, 'approve', timestamp, sig)) {
        logger.warn({ postId, timestamp, signature: sig }, 'Invalid approval signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Check rate limiting
      if (isRateLimited(postId)) {
        logger.warn({ postId }, 'Approval request rate limited');
        return res.status(429).json({ error: 'Too many requests for this post. Please wait.' });
      }

      // Get post and validate status
      const post = context.repository.getPost(postId);
      if (!post) {
        logger.warn({ postId }, 'Post not found for approval');
        return res.status(404).json({ error: 'Post not found' });
      }

      if (post.status !== 'DRAFT') {
        logger.warn({ 
          postId, 
          currentStatus: post.status 
        }, 'Post is not in DRAFT status for approval');
        
        return res.status(400).json({ 
          error: `Post is in ${post.status} status, cannot approve` 
        });
      }

      // Mark as approved first
      const approvalSuccess = context.repository.updatePostStatus(postId, 'APPROVED');
      if (!approvalSuccess) {
        logger.error({ postId }, 'Failed to update post status to APPROVED');
        return res.status(500).json({ error: 'Failed to update post status' });
      }

      // Record approval
      context.repository.createApproval({
        postId,
        action: 'approved',
        approvedBy: 'webhook', // Could be enhanced to extract from request headers/body
        notes: 'Approved via webhook',
      });

      // Publish via Publisher service
      const publishResult = await context.publisher.publishPost({
        postId,
        approvedBy: 'webhook',
        notes: 'Published via approval webhook',
      });

      if (!publishResult.success) {
        logger.error({ 
          postId, 
          error: publishResult.error 
        }, 'Failed to publish approved post');
        
        // Revert status back to DRAFT if publish failed
        context.repository.updatePostStatus(postId, 'DRAFT');
        
        return res.status(500).json({ 
          error: 'Failed to publish post', 
          details: publishResult.error 
        });
      }

      logger.info({ 
        postId, 
        bufferId: publishResult.bufferId 
      }, 'Post approved and published successfully');

      res.json({
        success: true,
        postId,
        status: 'PUBLISHED',
        bufferId: publishResult.bufferId,
        approvedAt: new Date().toISOString(),
      });

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Unexpected error in approval webhook');
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /webhooks/reject?postId=...&ts=...&sig=...
   * Reject a post and clean up Buffer drafts
   */
  router.post('/reject', async (req: Request, res: Response) => {
    try {
      // Validate query parameters
      const validationResult = RejectionQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        logger.warn({ 
          query: req.query, 
          errors: validationResult.error.issues 
        }, 'Invalid rejection request parameters');
        
        return res.status(400).json({
          error: 'Invalid parameters',
          details: validationResult.error.issues,
        });
      }

      const { postId, ts, sig } = validationResult.data;
      const timestamp = parseInt(ts, 10);

      // Check timestamp validity
      if (!isTimestampValid(timestamp)) {
        logger.warn({ postId, timestamp }, 'Rejection request timestamp is too old or too far in future');
        return res.status(400).json({ error: 'Request timestamp is invalid or expired' });
      }

      // Verify HMAC signature
      if (!verifyApprovalSignature(postId, 'reject', timestamp, sig)) {
        logger.warn({ postId, timestamp, signature: sig }, 'Invalid rejection signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Check rate limiting
      if (isRateLimited(postId)) {
        logger.warn({ postId }, 'Rejection request rate limited');
        return res.status(429).json({ error: 'Too many requests for this post. Please wait.' });
      }

      // Get post and validate status
      const post = context.repository.getPost(postId);
      if (!post) {
        logger.warn({ postId }, 'Post not found for rejection');
        return res.status(404).json({ error: 'Post not found' });
      }

      if (post.status !== 'DRAFT') {
        logger.warn({ 
          postId, 
          currentStatus: post.status 
        }, 'Post is not in DRAFT status for rejection');
        
        return res.status(400).json({ 
          error: `Post is in ${post.status} status, cannot reject` 
        });
      }

      // Reject via Publisher service (handles Buffer cleanup)
      const rejectResult = await context.publisher.rejectPost(
        postId, 
        'webhook', 
        'Rejected via webhook'
      );

      if (!rejectResult.success) {
        logger.error({ 
          postId, 
          error: rejectResult.error 
        }, 'Failed to reject post');
        
        return res.status(500).json({ 
          error: 'Failed to reject post', 
          details: rejectResult.error 
        });
      }

      logger.info({ postId }, 'Post rejected successfully');

      res.json({
        success: true,
        postId,
        status: 'REJECTED',
        rejectedAt: new Date().toISOString(),
      });

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Unexpected error in rejection webhook');
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /webhooks/health
   * Health check endpoint for webhook service
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'webhook-handler',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return router;
}

/**
 * Generate signed approval/rejection URLs for emails
 */
export function generateApprovalUrls(postId: string, baseUrl: string): {
  approveUrl: string;
  rejectUrl: string;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const approveSignature = createApprovalSignature(postId, 'approve', timestamp);
  const rejectSignature = createApprovalSignature(postId, 'reject', timestamp);
  
  const approveUrl = `${baseUrl}/webhooks/approve?postId=${postId}&ts=${timestamp}&sig=${approveSignature}`;
  const rejectUrl = `${baseUrl}/webhooks/reject?postId=${postId}&ts=${timestamp}&sig=${rejectSignature}`;
  
  return { approveUrl, rejectUrl };
}