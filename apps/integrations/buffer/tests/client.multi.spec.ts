import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { BufferMultiAssetClient } from '../src/client.js';
import { ValidationError, PlatformLimitError, BufferMultiAssetError } from '../src/types.js';

// Mock fs
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn()
  }
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BufferMultiAssetClient', () => {
  let client: BufferMultiAssetClient;

  beforeEach(() => {
    client = new BufferMultiAssetClient('test-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createMultiAssetUpdate', () => {
    const validParams = {
      profileId: 'profile-123',
      text: 'Test post with multiple images',
      media: {
        files: ['/path/image1.jpg', '/path/image2.jpg']
      },
      networkHints: {
        platform: 'instagram' as const,
        subtype: 'carousel' as const
      }
    };

    it('should validate input parameters', async () => {
      const invalidParams = {
        profileId: 'profile-123',
        text: '',
        media: { files: [] },
        networkHints: { platform: 'invalid' as any }
      };

      await expect(client.createMultiAssetUpdate(invalidParams)).rejects.toThrow();
    });

    it('should validate file existence and format', async () => {
      // Mock file that doesn't exist
      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      await expect(client.createMultiAssetUpdate(validParams)).rejects.toBeInstanceOf(ValidationError);
    });

    it('should validate supported image formats', async () => {
      // Mock valid file stats
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);

      // Mock invalid file format (text file)
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('not an image'));

      await expect(client.createMultiAssetUpdate(validParams)).rejects.toBeInstanceOf(ValidationError);
    });

    it('should validate file size limits', async () => {
      // Mock file that's too large
      vi.mocked(fs.stat).mockResolvedValue({
        size: 20 * 1024 * 1024, // 20MB
        isFile: () => true,
        isDirectory: () => false
      } as any);

      // Mock valid JPEG header
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      await expect(client.createMultiAssetUpdate(validParams)).rejects.toBeInstanceOf(ValidationError);
    });

    it('should enforce platform asset limits', async () => {
      const tooManyFilesParams = {
        ...validParams,
        media: {
          files: Array.from({ length: 15 }, (_, i) => `/path/image${i + 1}.jpg`)
        }
      };

      await expect(client.createMultiAssetUpdate(tooManyFilesParams)).rejects.toBeInstanceOf(PlatformLimitError);
    });

    it('should require networkHints.platform', async () => {
      const paramsWithoutPlatform = {
        ...validParams,
        networkHints: undefined
      };

      await expect(client.createMultiAssetUpdate(paramsWithoutPlatform)).rejects.toThrow(BufferMultiAssetError);
    });

    it('should create single update for valid single asset', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])); // JPEG

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          updates: [{
            id: 'update-123',
            status: 'draft'
          }]
        })
      });

      const singleAssetParams = {
        ...validParams,
        media: { files: ['/path/image1.jpg'] }
      };

      const result = await client.createMultiAssetUpdate(singleAssetParams);

      expect(result.updateId).toBe('update-123');
      expect(result.status).toBe('draft');
      expect(result.chunks).toBeUndefined();
    });

    it('should chunk files for carousel posts', async () => {
      // Mock valid files
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])); // JPEG

      // Mock successful API responses for 2 chunks
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            updates: [{
              id: 'update-123',
              status: 'draft'
            }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            updates: [{
              id: 'update-456',
              status: 'draft'
            }]
          })
        });

      const carouselParams = {
        ...validParams,
        media: {
          files: Array.from({ length: 12 }, (_, i) => `/path/image${i + 1}.jpg`) // 12 files, Instagram max 10
        }
      };

      const result = await client.createMultiAssetUpdate(carouselParams);

      expect(result.updateId).toBe('update-123');
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks![0].fileCount).toBe(10);
      expect(result.chunks![1].fileCount).toBe(2);
    });

    it('should handle scheduled posts', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          updates: [{
            id: 'update-123',
            status: 'scheduled',
            scheduled_at: Math.floor(Date.now() / 1000) + 3600
          }]
        })
      });

      const scheduledParams = {
        ...validParams,
        scheduledAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      };

      const result = await client.createMultiAssetUpdate(scheduledParams);

      expect(result.status).toBe('draft'); // Our normalization
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/updates/create.json'),
        expect.objectContaining({
          body: expect.stringContaining('scheduled_at')
        })
      );
    });

    it('should handle UTM parameters', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          updates: [{
            id: 'update-123',
            status: 'draft'
          }]
        })
      });

      const utmParams = {
        ...validParams,
        utm: {
          source: 'social',
          medium: 'carousel',
          campaign: 'product_launch'
        }
      };

      await client.createMultiAssetUpdate(utmParams);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"utm"')
        })
      );
    });

    it('should retry on 429 rate limit errors', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      // Mock 429 then success
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limit exceeded')
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            updates: [{
              id: 'update-123',
              status: 'draft'
            }]
          })
        });

      const result = await client.createMultiAssetUpdate(validParams);

      expect(result.updateId).toBe('update-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx server errors', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      // Mock 500 then success
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal server error')
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            updates: [{
              id: 'update-123',
              status: 'draft'
            }]
          })
        });

      const result = await client.createMultiAssetUpdate(validParams);

      expect(result.updateId).toBe('update-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx client errors', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request')
      });

      await expect(client.createMultiAssetUpdate(validParams)).rejects.toThrow(BufferMultiAssetError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors with retry', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      // Mock network error then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            updates: [{
              id: 'update-123',
              status: 'draft'
            }]
          })
        });

      const result = await client.createMultiAssetUpdate(validParams);

      expect(result.updateId).toBe('update-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should log request IDs and retry attempts', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          updates: [{
            id: 'update-123',
            status: 'draft'
          }]
        })
      });

      await client.createMultiAssetUpdate(validParams);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[BufferMultiAsset\] req_.* Attempt 1\/4/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[BufferMultiAsset\] req_.* Response: 200/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[BufferMultiAsset\] req_.* Success/)
      );

      consoleSpy.mockRestore();
    });

    it('should handle API response parsing errors', async () => {
      // Mock valid file
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false // API indicates failure
        })
      });

      await expect(client.createMultiAssetUpdate(validParams)).rejects.toThrow(BufferMultiAssetError);
    });
  });

  describe('MIME type detection', () => {
    it('should detect JPEG files', async () => {
      const client = new BufferMultiAssetClient('test');
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      expect(client['detectMimeType'](jpegBuffer)).toBe('image/jpeg');
    });

    it('should detect PNG files', async () => {
      const client = new BufferMultiAssetClient('test');
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      expect(client['detectMimeType'](pngBuffer)).toBe('image/png');
    });

    it('should detect WebP files', async () => {
      const client = new BufferMultiAssetClient('test');
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      expect(client['detectMimeType'](webpBuffer)).toBe('image/webp');
    });

    it('should detect GIF files', async () => {
      const client = new BufferMultiAssetClient('test');
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46]);
      expect(client['detectMimeType'](gifBuffer)).toBe('image/gif');
    });

    it('should return undefined for unknown formats', async () => {
      const client = new BufferMultiAssetClient('test');
      const unknownBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(client['detectMimeType'](unknownBuffer)).toBeUndefined();
    });
  });
});