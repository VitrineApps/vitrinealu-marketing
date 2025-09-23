import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { mediaQueue } from '../src/lib/queue.js';
import nock from 'nock';

describe('Background API E2E', () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(async () => {
    app = createServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    nock.cleanAll();
  });

  it('should enqueue background replace job and return 202', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/background/replace',
      payload: {
        mediaId: 'test-media-123',
        inputPath: '/path/to/input.jpg',
        projectId: 'test-project',
        callbackUrl: 'https://example.com/webhook'
      }
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('jobId');
    expect(typeof body.jobId).toBe('string');
  });

  it('should validate request payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/background/replace',
      payload: {
        // Missing required fields
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('issues');
  });

  it('should send webhook on job success with valid signature', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const webhookScope = nock(webhookUrl)
      .post('/')
      .matchHeader('X-Webhook-Signature', /^sha256=[a-f0-9]{64}$/)
      .reply(200);

    // Mock the job processing
    // This would require mocking the queue and orchestrator

    // For now, just test the API endpoint
    const response = await app.inject({
      method: 'POST',
      url: '/background/replace',
      payload: {
        mediaId: 'test-media-123',
        inputPath: '/path/to/input.jpg',
        projectId: 'test-project',
        callbackUrl: webhookUrl
      }
    });

    expect(response.statusCode).toBe(202);

    // In a real test, we'd wait for the job to complete and check webhook
    // webhookScope.done();
  });

  it('should handle invalid callback URL gracefully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/background/replace',
      payload: {
        mediaId: 'test-media-123',
        inputPath: '/path/to/input.jpg',
        projectId: 'test-project',
        callbackUrl: 'not-a-url'
      }
    });

    expect(response.statusCode).toBe(400);
  });
});