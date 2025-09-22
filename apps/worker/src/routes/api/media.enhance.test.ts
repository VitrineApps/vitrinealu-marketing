import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockEnqueueAndWait } = vi.hoisted(() => ({
  mockEnqueueAndWait: vi.fn(async () => ({ ok: true, result: { url: "drive://out.jpg", metadata:{provider:"Noop"} } }))
}));
vi.mock("../../lib/queue", () => ({ enqueueAndWait: mockEnqueueAndWait }));

// import the module under test AFTER the mocks
import { registerMediaRoutes } from './media.js';
import Fastify, { type FastifyInstance } from 'fastify';

describe('POST /enhance', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify();
    registerMediaRoutes(app);
    vi.clearAllMocks();
  });

  afterEach(() => {
    app.close();
  });

  it('should enhance an image and return url with metadata', async () => {
    const mockResult = {
      ok: true,
      result: {
        url: 'https://example.com/enhanced.jpg',
        metadata: { provider: 'topaz', scale: 2, ms: 150 }
      }
    };
    mockEnqueueAndWait.mockResolvedValue(mockResult);

    const response = await app.inject({
      method: 'POST',
      url: '/enhance',
      payload: { assetId: 'test-asset-id' }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      url: 'https://example.com/enhanced.jpg',
      metadata: { provider: 'topaz', scale: 2, ms: 150 }
    });
    expect(mockEnqueueAndWait).toHaveBeenCalledWith({
      kind: 'enhance',
      assetId: 'test-asset-id'
    });
  });

  it('should handle sourceUrl input', async () => {
    const mockResult = {
      ok: true,
      result: {
        url: 'https://example.com/enhanced.jpg',
        metadata: { provider: 'real-esrgan', scale: 2, ms: 200 }
      }
    };
    mockEnqueueAndWait.mockResolvedValue(mockResult);

    const response = await app.inject({
      method: 'POST',
      url: '/enhance',
      payload: { sourceUrl: 'https://example.com/input.jpg' }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      url: 'https://example.com/enhanced.jpg',
      metadata: { provider: 'real-esrgan', scale: 2, ms: 200 }
    });
  });

  it('should enhance with sourceUrl and sync', async () => {
    const mockResult = {
      ok: true,
      result: {
        url: 'drive://enhanced.jpg',
        metadata: { provider: 'Noop' }
      }
    };
    mockEnqueueAndWait.mockResolvedValue(mockResult);

    const response = await app.inject({
      method: 'POST',
      url: '/enhance',
      payload: { sourceUrl: 'file:///e:/my_projects/vitrinealu-marketing/apps/worker/test/fixtures/bright.jpg', sync: 1 }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('url');
    expect(body).toHaveProperty('metadata');
    expect(body.metadata).toHaveProperty('provider');
  });

  it('should return 400 for invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/enhance',
      payload: {} // Missing assetId and sourceUrl
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toHaveProperty('error');
  });
});