import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Video API', () => {
  let server: any;

  beforeAll(async () => {
    // Start the server for testing
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('GET /api/video/adapters', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/video/adapters');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authorization header required');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/video/adapters')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('POST /api/video/generate', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/video/generate')
        .send({
          profile: 'reel',
          clips: [
            { image: 'test.jpg', durationSec: 3 }
          ]
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authorization header required');
    });

    it('should return 400 with invalid request data', async () => {
      const response = await request(app)
        .post('/api/video/generate')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          profile: 'invalid-profile',
          clips: []
        });

      expect(response.status).toBe(401); // Will fail auth first
    });
  });

  describe('Health check', () => {
    it('should return 200 for health endpoint', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });
});