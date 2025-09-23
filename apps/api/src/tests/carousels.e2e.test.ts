import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createJWT } from '@vitrinealu/shared';
import app from '../index.js';

describe('Carousel API', () => {
  const testSecret = 'test-secret-key';
  let editorToken: string;
  let invalidToken: string;

  beforeEach(() => {
    // Create test tokens
    editorToken = createJWT({ userId: 'user-1', role: 'editor' }, testSecret);
    invalidToken = createJWT({ userId: 'user-2', role: 'viewer' }, testSecret);
  });

  describe('GET /api/carousels/preview', () => {
    it('should return 401 without authorization header', async () => {
      const response = await request(app)
        .get('/api/carousels/preview')
        .expect(401);

      expect(response.body.error).toBe('Authorization header required');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/carousels/preview')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 403 for non-editor role', async () => {
      const response = await request(app)
        .get('/api/carousels/preview')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(403);

      expect(response.body.error).toBe('Editor role required');
    });

    it('should return pending carousels for editor', async () => {
      const response = await request(app)
        .get('/api/carousels/preview')
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('carousels');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.carousels)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });
  });

  describe('POST /api/carousels/approve', () => {
    it('should return 401 without authorization header', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .send({ carouselId: 'test-id', action: 'approve' })
        .expect(401);

      expect(response.body.error).toBe('Authorization header required');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .set('Authorization', 'Bearer invalid-token')
        .send({ carouselId: 'test-id', action: 'approve' })
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 403 for non-editor role', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({ carouselId: 'test-id', action: 'approve' })
        .expect(403);

      expect(response.body.error).toBe('Editor role required');
    });

    it('should return 400 for invalid request data', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ invalidField: 'test' })
        .expect(400);

      expect(response.body.error).toBe('Invalid request data');
      expect(response.body.details).toBeDefined();
    });

    it('should return 404 for non-existent carousel', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ carouselId: 'non-existent', action: 'approve' })
        .expect(404);

      expect(response.body.error).toBe('Carousel not found');
    });

    it('should approve carousel successfully', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          carouselId: 'carousel-1',
          action: 'approve',
          comments: 'Looks good!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.carousel.id).toBe('carousel-1');
      expect(response.body.carousel.status).toBe('approved');
      expect(response.body.carousel.action).toBe('approve');
      expect(response.body.carousel.comments).toBe('Looks good!');
    });

    it('should reject carousel successfully', async () => {
      const response = await request(app)
        .post('/api/carousels/approve')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          carouselId: 'carousel-2',
          action: 'reject',
          comments: 'Needs revision'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.carousel.id).toBe('carousel-2');
      expect(response.body.carousel.status).toBe('draft');
      expect(response.body.carousel.action).toBe('reject');
      expect(response.body.carousel.comments).toBe('Needs revision');
    });
  });
});