import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { createWebhookRoutes, createApprovalSignature, generateApprovalUrls } from '../routes/webhooks.js';
import { Repository } from '../repository.js';

// Mock the Publisher
const mockPublisher = {
  publishPost: vi.fn(),
  rejectPost: vi.fn(),
};

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...originalEnv,
    APPROVAL_HMAC_SECRET: 'test-secret-that-is-at-least-32-characters-long-for-security',
  };
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('Webhook Routes', () => {
  let app: express.Application;
  let repository: Repository;

  beforeEach(() => {
    repository = new Repository(':memory:');
    app = express();
    app.use(express.json());
    app.use('/webhooks', createWebhookRoutes({
      repository,
      publisher: mockPublisher as any,
    }));
  });

  describe('HMAC signature functions', () => {
    describe('createApprovalSignature', () => {
      it('should create consistent signatures', () => {
        const postId = '123e4567-e89b-12d3-a456-426614174000';
        const timestamp = 1640995200;
        
        const sig1 = createApprovalSignature(postId, 'approve', timestamp);
        const sig2 = createApprovalSignature(postId, 'approve', timestamp);
        
        expect(sig1).toBe(sig2);
        expect(sig1).toMatch(/^[a-f0-9]{64}$/); // Valid SHA256 hex
      });

      it('should create different signatures for different actions', () => {
        const postId = '123e4567-e89b-12d3-a456-426614174000';
        const timestamp = 1640995200;
        
        const approveSig = createApprovalSignature(postId, 'approve', timestamp);
        const rejectSig = createApprovalSignature(postId, 'reject', timestamp);
        
        expect(approveSig).not.toBe(rejectSig);
      });

      it('should create different signatures for different timestamps', () => {
        const postId = '123e4567-e89b-12d3-a456-426614174000';
        
        const sig1 = createApprovalSignature(postId, 'approve', 1640995200);
        const sig2 = createApprovalSignature(postId, 'approve', 1640995201);
        
        expect(sig1).not.toBe(sig2);
      });

      it('should throw error when HMAC secret is missing', () => {
        delete process.env.APPROVAL_HMAC_SECRET;
        
        expect(() => createApprovalSignature('test', 'approve', 123))
          .toThrow('APPROVAL_HMAC_SECRET environment variable is required');
      });
    });

    describe('generateApprovalUrls', () => {
      it('should generate valid URLs with signatures', () => {
        const postId = '123e4567-e89b-12d3-a456-426614174000';
        const baseUrl = 'https://example.com';
        
        const { approveUrl, rejectUrl } = generateApprovalUrls(postId, baseUrl);
        
        expect(approveUrl).toMatch(new RegExp(`^${baseUrl}/webhooks/approve\\?postId=${postId}&ts=\\d+&sig=[a-f0-9]{64}$`));
        expect(rejectUrl).toMatch(new RegExp(`^${baseUrl}/webhooks/reject\\?postId=${postId}&ts=\\d+&sig=[a-f0-9]{64}$`));
        
        // URLs should be different
        expect(approveUrl).not.toBe(rejectUrl);
      });

      it('should generate URLs with recent timestamps', () => {
        const postId = '123e4567-e89b-12d3-a456-426614174000';
        const baseUrl = 'https://example.com';
        
        const beforeTime = Math.floor(Date.now() / 1000);
        const { approveUrl } = generateApprovalUrls(postId, baseUrl);
        const afterTime = Math.floor(Date.now() / 1000);
        
        const urlParams = new URL(approveUrl);
        const timestamp = parseInt(urlParams.searchParams.get('ts') || '0');
        
        expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(timestamp).toBeLessThanOrEqual(afterTime);
      });
    });
  });

  describe('POST /webhooks/approve', () => {
    let testPostId: string;

    beforeEach(() => {
      // Create a test post in DRAFT status
      const post = repository.insertPost({
        id: '123e4567-e89b-12d3-a456-426614174000',
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Test post',
        hashtags: ['test'],
        mediaUrls: ['https://example.com/image.jpg'],
        scheduledAt: new Date(),
      });
      testPostId = post.id;
    });

    it('should approve a post with valid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(testPostId, 'approve', timestamp);
      
      mockPublisher.publishPost.mockResolvedValue({
        success: true,
        bufferId: 'buffer123',
      });

      const response = await request(app)
        .post(`/webhooks/approve?postId=${testPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        postId: testPostId,
        status: 'PUBLISHED',
        bufferId: 'buffer123',
      });

      expect(mockPublisher.publishPost).toHaveBeenCalledWith({
        postId: testPostId,
        approvedBy: 'webhook',
        notes: 'Published via approval webhook',
      });

      // Verify post status was updated
      const updatedPost = repository.getPost(testPostId);
      expect(updatedPost?.status).toBe('APPROVED'); // Should be APPROVED first, then PUBLISHED by publisher
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = 'invalid-signature';

      const response = await request(app)
        .post(`/webhooks/approve?postId=${testPostId}&ts=${timestamp}&sig=${invalidSignature}`)
        .expect(401);

      expect(response.body.error).toBe('Invalid signature');
      expect(mockPublisher.publishPost).not.toHaveBeenCalled();
    });

    it('should reject request with expired timestamp', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600 - 60; // More than 1 hour ago
      const signature = createApprovalSignature(testPostId, 'approve', expiredTimestamp);

      const response = await request(app)
        .post(`/webhooks/approve?postId=${expiredTimestamp}&ts=${expiredTimestamp}&sig=${signature}`)
        .expect(400);

      expect(response.body.error).toBe('Request timestamp is invalid or expired');
      expect(mockPublisher.publishPost).not.toHaveBeenCalled();
    });

    it('should reject request with invalid post ID format', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidPostId = 'not-a-uuid';
      const signature = createApprovalSignature(invalidPostId, 'approve', timestamp);

      const response = await request(app)
        .post(`/webhooks/approve?postId=${invalidPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(400);

      expect(response.body.error).toBe('Invalid parameters');
      expect(response.body.details).toBeDefined();
    });

    it('should reject request for non-existent post', async () => {
      const nonExistentPostId = '999e4567-e89b-12d3-a456-426614174999';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(nonExistentPostId, 'approve', timestamp);

      const response = await request(app)
        .post(`/webhooks/approve?postId=${nonExistentPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(404);

      expect(response.body.error).toBe('Post not found');
    });

    it('should reject request for post not in DRAFT status', async () => {
      // Update post to PUBLISHED status
      repository.updatePostStatus(testPostId, 'PUBLISHED');
      
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(testPostId, 'approve', timestamp);

      const response = await request(app)
        .post(`/webhooks/approve?postId=${testPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(400);

      expect(response.body.error).toContain('Post is in PUBLISHED status, cannot approve');
    });

    it('should handle publisher failure gracefully', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(testPostId, 'approve', timestamp);

      mockPublisher.publishPost.mockResolvedValue({
        success: false,
        error: 'Buffer API error',
      });

      const response = await request(app)
        .post(`/webhooks/approve?postId=${testPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(500);

      expect(response.body.error).toBe('Failed to publish post');
      expect(response.body.details).toBe('Buffer API error');

      // Post should be reverted to DRAFT status
      const updatedPost = repository.getPost(testPostId);
      expect(updatedPost?.status).toBe('DRAFT');
    });

    it('should implement rate limiting', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(testPostId, 'approve', timestamp);

      mockPublisher.publishPost.mockResolvedValue({
        success: true,
        bufferId: 'buffer123',
      });

      // First request should succeed
      await request(app)
        .post(`/webhooks/approve?postId=${testPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(200);

      // Second request within rate limit window should be rejected
      const timestamp2 = Math.floor(Date.now() / 1000);
      const signature2 = createApprovalSignature(testPostId, 'approve', timestamp2);

      const response = await request(app)
        .post(`/webhooks/approve?postId=${testPostId}&ts=${timestamp2}&sig=${signature2}`)
        .expect(429);

      expect(response.body.error).toContain('Too many requests');
    });
  });

  describe('POST /webhooks/reject', () => {
    let testPostId: string;

    beforeEach(() => {
      // Create a test post in DRAFT status
      const post = repository.insertPost({
        id: '123e4567-e89b-12d3-a456-426614174000',
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Test post',
        hashtags: ['test'],
        mediaUrls: ['https://example.com/image.jpg'],
        scheduledAt: new Date(),
      });
      testPostId = post.id;
    });

    it('should reject a post with valid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(testPostId, 'reject', timestamp);

      mockPublisher.rejectPost.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post(`/webhooks/reject?postId=${testPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        postId: testPostId,
        status: 'REJECTED',
      });

      expect(mockPublisher.rejectPost).toHaveBeenCalledWith(
        testPostId,
        'webhook',
        'Rejected via webhook'
      );
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = 'invalid-signature';

      const response = await request(app)
        .post(`/webhooks/reject?postId=${testPostId}&ts=${timestamp}&sig=${invalidSignature}`)
        .expect(401);

      expect(response.body.error).toBe('Invalid signature');
      expect(mockPublisher.rejectPost).not.toHaveBeenCalled();
    });

    it('should handle publisher failure gracefully', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(testPostId, 'reject', timestamp);

      mockPublisher.rejectPost.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const response = await request(app)
        .post(`/webhooks/reject?postId=${testPostId}&ts=${timestamp}&sig=${signature}`)
        .expect(500);

      expect(response.body.error).toBe('Failed to reject post');
      expect(response.body.details).toBe('Database error');
    });

    it('should use different signature than approve', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const approveSignature = createApprovalSignature(testPostId, 'approve', timestamp);

      // Using approve signature for reject should fail
      const response = await request(app)
        .post(`/webhooks/reject?postId=${testPostId}&ts=${timestamp}&sig=${approveSignature}`)
        .expect(401);

      expect(response.body.error).toBe('Invalid signature');
    });
  });

  describe('GET /webhooks/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/webhooks/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'webhook-handler',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });
  });

  describe('security considerations', () => {
    it('should use constant-time comparison for signatures', async () => {
      const postId = '123e4567-e89b-12d3-a456-426614174000';
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Create a signature with one bit different
      const correctSignature = createApprovalSignature(postId, 'approve', timestamp);
      const tampered = correctSignature.slice(0, -1) + (correctSignature.slice(-1) === 'a' ? 'b' : 'a');

      const repository = new Repository(':memory:');
      repository.insertPost({
        id: postId,
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Test',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
      });

      const app = express();
      app.use(express.json());
      app.use('/webhooks', createWebhookRoutes({
        repository,
        publisher: mockPublisher as any,
      }));

      // Both should fail in similar time (constant-time comparison)
      const start1 = Date.now();
      await request(app).post(`/webhooks/approve?postId=${postId}&ts=${timestamp}&sig=${tampered}`);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app).post(`/webhooks/approve?postId=${postId}&ts=${timestamp}&sig=completely-wrong-signature`);
      const time2 = Date.now() - start2;

      // Times should be relatively similar (within 50ms) for constant-time comparison
      expect(Math.abs(time1 - time2)).toBeLessThan(50);
    });

    it('should prevent timestamp reuse attacks', async () => {
      const postId = '123e4567-e89b-12d3-a456-426614174000';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createApprovalSignature(postId, 'approve', timestamp);

      repository.insertPost({
        id: postId,
        platform: 'instagram',
        status: 'DRAFT',
        caption: 'Test',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: new Date(),
      });

      mockPublisher.publishPost.mockResolvedValue({ success: true, bufferId: 'test' });

      // First request should succeed
      await request(app)
        .post(`/webhooks/approve?postId=${postId}&ts=${timestamp}&sig=${signature}`)
        .expect(200);

      // Reset post to DRAFT for second attempt
      repository.updatePostStatus(postId, 'DRAFT');

      // Second request with same timestamp should be rate limited
      const response = await request(app)
        .post(`/webhooks/approve?postId=${postId}&ts=${timestamp}&sig=${signature}`)
        .expect(429);

      expect(response.body.error).toContain('Too many requests');
    });
  });
});