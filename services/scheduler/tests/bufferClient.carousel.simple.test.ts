import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';

// Mock environment variables before any imports
process.env.BUFFER_ACCESS_TOKEN = 'test-token';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.APPROVAL_HMAC_SECRET = 'test-hmac-secret';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.OWNER_EMAIL = 'test@example.com';

import { BufferClient } from '../src/bufferClient';

// Mock fetch globally
const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
vi.stubGlobal('fetch', mockFetch);

describe('BufferClient Carousel Tests', () => {
  let client: BufferClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BufferClient();
  });

  it('should create carousel draft successfully', async () => {
    // Mock successful response
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      update: {
        id: 'test-carousel-id',
        status: 'pending',
        service: 'instagram'
      }
    }), { status: 200 }));

    const result = await client.createCarouselDraft({
      channelId: 'test-channel-id',
      platform: 'instagram',
      mediaUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      text: 'Test carousel caption'
    });

    expect(result.updateId).toBe('test-carousel-id');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should validate minimum image count', async () => {
    await expect(
      client.createCarouselDraft({
        channelId: 'test-channel-id',
        platform: 'instagram',
        mediaUrls: ['https://example.com/img1.jpg'], // Only 1 image
        text: 'Test caption'
      })
    ).rejects.toThrow('Carousel requires at least 2 images');
  });

  it('should validate maximum image count', async () => {
    const manyImages = Array.from({ length: 11 }, (_, i) => `https://example.com/img${i}.jpg`);
    
    await expect(
      client.createCarouselDraft({
        channelId: 'test-channel-id',
        platform: 'instagram',
        mediaUrls: manyImages,
        text: 'Test caption'
      })
    ).rejects.toThrow('Carousel supports maximum 10 images');
  });

  it('should validate platform support', async () => {
    await expect(
      client.createCarouselDraft({
        channelId: 'test-channel-id',
        platform: 'twitter' as any, // Twitter doesn't support carousels
        mediaUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        text: 'Test caption'
      })
    ).rejects.toThrow('Platform twitter does not support carousel posts');
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Bad request', { status: 400 }));

    await expect(
      client.createCarouselDraft({
        channelId: 'test-channel-id',
        platform: 'instagram',
        mediaUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        text: 'Test caption'
      })
    ).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(
      client.createCarouselDraft({
        channelId: 'test-channel-id',
        platform: 'instagram',
        mediaUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        text: 'Test caption'
      })
    ).rejects.toThrow('Network failure');
  });
});