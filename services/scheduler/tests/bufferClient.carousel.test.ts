import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCarouselDraft, BufferClient, ValidationError, RateLimitError, ApiError } from '../src/bufferClient.js';
import type { CarouselDraftInput } from '../src/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config
vi.mock('../src/config.js', () => ({
  config: {
    config: {
      BUFFER_BASE_URL: 'https://api.buffer.com/2/',
      BUFFER_ACCESS_TOKEN: 'test-token',
      HTTP_TIMEOUT_MS: 15000
    }
  }
}));

describe('Enhanced Buffer Client - Carousel Support', () => {
  const validCarouselInput: CarouselDraftInput = {
    channelId: 'test-channel-id',
    text: 'Test carousel caption with multiple images',
    mediaUrls: [
      'https://example.com/img1.jpg',
      'https://example.com/img2.jpg',
      'https://example.com/img3.jpg'
    ],
    platform: 'instagram' as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up environment variables
    process.env.BUFFER_ACCESS_TOKEN = 'test-token';
    process.env.BUFFER_BASE_URL = 'https://api.buffer.com/2/';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createCarouselDraft', () => {

    it('should create carousel draft with multiple images', async () => {
      const mockResponse = {
        update: {
          id: 'buffer-update-id',
          service: 'instagram',
          status: 'pending',
          media_attachments: [
            { id: 'media-1', url: 'https://example.com/img1.jpg', type: 'image' },
            { id: 'media-2', url: 'https://example.com/img2.jpg', type: 'image' },
            { id: 'media-3', url: 'https://example.com/img3.jpg', type: 'image' }
          ]
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map()
      });

      const result = await createCarouselDraft(validCarouselInput);

      expect(result).toEqual({
        updateId: 'buffer-update-id',
        mediaIds: ['media-1', 'media-2', 'media-3'],
        platform: 'instagram'
      });

      // Verify payload structure
      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      
      expect(payload.media.photos).toHaveLength(3);
      expect(payload.media.photos[0]).toEqual({
        url: 'https://example.com/img1.jpg',
        type: 'image',
        alt_text: 'Image 1 of 3'
      });
      expect(payload.shorten).toBe(false);
    });

    it('should handle scheduled carousel posts', async () => {
      const scheduledInput = {
        ...validCarouselInput,
        scheduledAt: '2024-12-01T12:00:00Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'instagram' }
        }),
        headers: new Map()
      });

      await createCarouselDraft(scheduledInput);

      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      
      expect(payload.scheduled_at).toBeDefined();
      expect(typeof payload.scheduled_at).toBe('number');
    });

    it('should include link in carousel payload', async () => {
      const inputWithLink = {
        ...validCarouselInput,
        link: 'https://vitrinealu.com/portfolio'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'instagram' }
        }),
        headers: new Map()
      });

      await createCarouselDraft(inputWithLink);

      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      
      expect(payload.link).toBe('https://vitrinealu.com/portfolio');
    });

    it('should support Facebook carousel format', async () => {
      const facebookInput = {
        ...validCarouselInput,
        platform: 'facebook' as const
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'facebook' }
        }),
        headers: new Map()
      });

      await createCarouselDraft(facebookInput);

      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      
      expect(payload.media.photos).toHaveLength(3);
      expect(payload.profile_ids).toEqual(['test-channel-id']);
    });

    it('should validate minimum image count', async () => {
      const invalidInput = {
        ...validCarouselInput,
        mediaUrls: ['https://example.com/single-image.jpg']
      };

      await expect(createCarouselDraft(invalidInput)).rejects.toThrow(ValidationError);
      await expect(createCarouselDraft(invalidInput)).rejects.toThrow('at least 2 images');
    });

    it('should validate maximum image count (Buffer limit)', async () => {
      const tooManyImages = {
        ...validCarouselInput,
        mediaUrls: Array.from({ length: 15 }, (_, i) => `https://example.com/img${i}.jpg`)
      };

      await expect(createCarouselDraft(tooManyImages)).rejects.toThrow(ValidationError);
      await expect(createCarouselDraft(tooManyImages)).rejects.toThrow('more than 10 images');
    });

    it('should validate platform support', async () => {
      const unsupportedPlatform = {
        ...validCarouselInput,
        platform: 'twitter' as any
      };

      await expect(createCarouselDraft(unsupportedPlatform)).rejects.toThrow(ValidationError);
      await expect(createCarouselDraft(unsupportedPlatform)).rejects.toThrow('must be instagram or facebook');
    });

    it('should validate caption length for Instagram', async () => {
      const longCaption = {
        ...validCarouselInput,
        text: 'A'.repeat(2300) // Exceeds Instagram limit of 2200
      };

      await expect(createCarouselDraft(longCaption)).rejects.toThrow(ValidationError);
      await expect(createCarouselDraft(longCaption)).rejects.toThrow('exceeds platform limit');
    });

    it('should validate caption length for Facebook', async () => {
      const facebookInput = {
        ...validCarouselInput,
        platform: 'facebook' as const,
        text: 'A'.repeat(70000) // Exceeds Facebook limit
      };

      await expect(createCarouselDraft(facebookInput)).rejects.toThrow(ValidationError);
      await expect(createCarouselDraft(facebookInput)).rejects.toThrow('exceeds platform limit');
    });

    it('should handle rate limiting with retry', async () => {
      // First call returns 429, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '2']]),
          text: async () => 'Rate limited'
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            update: { id: 'test-id', service: 'instagram' }
          }),
          headers: new Map()
        });

      const result = await createCarouselDraft(validCarouselInput);

      expect(result.updateId).toBe('test-id');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle server errors with retry', async () => {
      // First call returns 500, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal server error'
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            update: { id: 'test-id', service: 'instagram' }
          }),
          headers: new Map()
        });

      const result = await createCarouselDraft(validCarouselInput);

      expect(result.updateId).toBe('test-id');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should abort on client errors (4xx)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request'
      });

      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow(ApiError);
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'response' }),
        headers: new Map()
      });

      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow(ApiError);
      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow('Malformed response');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow(ApiError);
      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow('Network error');
    });

    it('should properly handle timeout', async () => {
      // Mock a hanging request
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      // Use shorter timeout for test
      process.env.HTTP_TIMEOUT_MS = '100';

      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow();
    });
  });

  describe('BufferClient class methods', () => {
    let client: BufferClient;

    beforeEach(() => {
      client = new BufferClient();
    });

    it('should create carousel draft via class method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'instagram' }
        }),
        headers: new Map()
      });

      const result = await client.createCarouselDraft(validCarouselInput);

      expect(result.updateId).toBe('test-id');
    });

    it('should schedule draft via class method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        headers: new Map()
      });

      await expect(client.scheduleDraft('test-update-id')).resolves.not.toThrow();

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('/updates/test-update-id/share.json');
      expect(fetchCall[1].method).toBe('POST');
    });

    it('should delete draft via class method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        headers: new Map()
      });

      await expect(client.deleteDraft('test-update-id')).resolves.not.toThrow();

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('/updates/test-update-id/destroy.json');
      expect(fetchCall[1].method).toBe('POST');
    });

    it('should handle errors in schedule/delete operations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid update ID'
      });

      await expect(client.scheduleDraft('invalid-id')).rejects.toThrow(ApiError);
      await expect(client.scheduleDraft('invalid-id')).rejects.toThrow('Buffer share failed');
    });
  });

  describe('media payload structure', () => {
    it('should create proper media structure for Instagram', async () => {
      const instagramInput = {
        ...validCarouselInput,
        platform: 'instagram' as const,
        mediaUrls: [
          'https://cdn.example.com/high-res-img1.jpg',
          'https://cdn.example.com/high-res-img2.jpg'
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'instagram' }
        }),
        headers: new Map()
      });

      await createCarouselDraft(instagramInput);

      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      
      expect(payload.media.photos).toEqual([
        {
          url: 'https://cdn.example.com/high-res-img1.jpg',
          type: 'image',
          alt_text: 'Image 1 of 2'
        },
        {
          url: 'https://cdn.example.com/high-res-img2.jpg',
          type: 'image',
          alt_text: 'Image 2 of 2'
        }
      ]);
    });

    it('should handle maximum supported images (10)', async () => {
      const maxImagesInput = {
        ...validCarouselInput,
        mediaUrls: Array.from({ length: 10 }, (_, i) => `https://example.com/img${i + 1}.jpg`)
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'instagram' }
        }),
        headers: new Map()
      });

      await createCarouselDraft(maxImagesInput);

      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      
      expect(payload.media.photos).toHaveLength(10);
      expect(payload.media.photos[9].alt_text).toBe('Image 10 of 10');
    });
  });

  describe('authorization and configuration', () => {
    it('should throw error when access token is missing', async () => {
      delete process.env.BUFFER_ACCESS_TOKEN;
      
      // Mock config to return undefined
      vi.doMock('../src/config.js', () => ({
        config: {
          config: {
            BUFFER_BASE_URL: 'https://api.buffer.com/2/',
            BUFFER_ACCESS_TOKEN: undefined
          }
        }
      }));

      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow(ValidationError);
      await expect(createCarouselDraft(validCarouselInput)).rejects.toThrow('Missing BUFFER_ACCESS_TOKEN');
    });

    it('should use custom base URL when provided', async () => {
      process.env.BUFFER_BASE_URL = 'https://custom.buffer-api.com/v2/';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          update: { id: 'test-id', service: 'instagram' }
        }),
        headers: new Map()
      });

      await createCarouselDraft(validCarouselInput);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('custom.buffer-api.com');
    });
  });
});