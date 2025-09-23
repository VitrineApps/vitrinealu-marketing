/**
 * Tests for the background processing client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundClient, createClient, brandPresets } from '../src/index.js';
import type { Config, CleanupRequest, ReplaceRequest } from '../src/types.js';

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn()
}));

// Mock form-data
vi.mock('form-data', () => ({
  default: vi.fn().mockImplementation(() => ({
    append: vi.fn(),
    getHeaders: vi.fn().mockReturnValue({})
  }))
}));

// Mock fs - make it always return true for file validation
vi.mock('fs', () => ({
  createReadStream: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true)
}));

vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({
    isFile: () => true,
    size: 1024 * 1024 // 1MB
  })
}));

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('BackgroundClient', () => {
  let client: BackgroundClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const testConfig: Partial<Config> = {
      baseUrl: 'http://localhost:8089',
      timeout: 30000,
      retryAttempts: 1,
      retryDelay: 100
    };
    
    client = createClient(testConfig);
    mockFetch = vi.mocked((await import('node-fetch')).default);
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cleanup', () => {
    it('should successfully clean up background with transparent mode', async () => {
      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          outputPath: '/output/cleaned_image.png',
          message: 'Background cleanup completed successfully'
        })
      });

      const request: CleanupRequest = {
        imagePath: '/test/image.jpg',
        mode: 'transparent',
        enhanceFg: true,
        denoise: false
      };

      const result = await client.cleanup(request);

      expect(result).toEqual({
        mode: 'cleanup',
        outJpg: '/output/cleaned_image.png',
        processedAt: expect.any(String),
        settings: {
          mode: 'transparent',
          enhanceFg: true,
          denoise: false,
          blurRadius: undefined,
          desaturatePct: undefined
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8089/background/cleanup',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should successfully clean up background with soften mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          outputPath: '/output/softened_image.jpg',
          message: 'Background cleanup completed successfully'
        })
      });

      const request: CleanupRequest = {
        imagePath: '/test/image.jpg',
        mode: 'soften',
        blurRadius: 15,
        desaturatePct: 50,
        enhanceFg: false,
        denoise: true
      };

      const result = await client.cleanup(request);

      expect(result.mode).toBe('cleanup');
      expect(result.outJpg).toBe('/output/softened_image.jpg');
      expect(result.settings?.mode).toBe('soften');
      expect(result.settings?.blurRadius).toBe(15);
      expect(result.settings?.desaturatePct).toBe(50);
    });

    it('should handle cleanup failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Processing failed: Invalid image format'
        })
      });

      const request: CleanupRequest = {
        imagePath: '/test/invalid.txt',
        mode: 'transparent'
      };

      await expect(client.cleanup(request)).rejects.toThrow('Processing failed: Invalid image format');
    });
  });

  describe('replace', () => {
    it('should successfully replace background', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          outputPath: '/output/replaced_image.jpg',
          message: 'Background replacement completed successfully'
        })
      });

      const request: ReplaceRequest = {
        imagePath: '/test/product.jpg',
        prompt: 'modern minimalist studio with soft lighting',
        negativePrompt: 'people, text, cluttered',
        steps: 25,
        guidanceScale: 7.5,
        engine: 'SDXL',
        seed: 12345
      };

      const result = await client.replace(request);

      expect(result).toEqual({
        mode: 'replace',
        engine: 'SDXL',
        outJpg: '/output/replaced_image.jpg',
        processedAt: expect.any(String),
        prompt: 'modern minimalist studio with soft lighting',
        settings: {
          negativePrompt: 'people, text, cluttered',
          seed: 12345,
          steps: 25,
          guidanceScale: 7.5,
          enhanceFg: true,
          matchColors: true,
          featherEdges: true
        }
      });
    });

    it('should use default values for optional parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          outputPath: '/output/replaced_default.jpg'
        })
      });

      const request: ReplaceRequest = {
        imagePath: '/test/product.jpg',
        prompt: 'beautiful garden background'
      };

      const result = await client.replace(request);

      expect(result.settings?.negativePrompt).toBe('people, text, watermark');
      expect(result.settings?.steps).toBe(20);
      expect(result.settings?.guidanceScale).toBe(7.5);
      expect(result.settings?.enhanceFg).toBe(true);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed'));

      const request: ReplaceRequest = {
        imagePath: '/test/product.jpg',
        prompt: 'studio background'
      };

      await expect(client.replace(request)).rejects.toThrow('Network error: Network connection failed');
    });
  });

  describe('health check', () => {
    it('should return true for healthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          engine: 'SDXL',
          device: 'cuda'
        })
      });

      const isHealthy = await client.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy service', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Service unavailable'));

      const isHealthy = await client.isHealthy();
      expect(isHealthy).toBe(false);
    });

    it('should get service status', async () => {
      const expectedStatus = {
        status: 'healthy',
        engine: 'SDXL',
        device: 'cuda'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => expectedStatus
      });

      const status = await client.getStatus();
      expect(status).toEqual(expectedStatus);
    });
  });

  describe('validation', () => {
    it('should validate cleanup request parameters', async () => {
      const invalidRequest = {
        imagePath: '/test/image.jpg',
        mode: 'invalid_mode' as 'transparent'
      };

      await expect(client.cleanup(invalidRequest)).rejects.toThrow();
    });

    it('should validate replace request parameters', async () => {
      const invalidRequest = {
        imagePath: '/test/image.jpg',
        prompt: '', // Empty prompt should fail
        steps: 150 // Too many steps
      };

      await expect(client.replace(invalidRequest)).rejects.toThrow();
    });
  });
});

describe('Brand Presets', () => {
  it('should have VitrineAlu brand preset', () => {
    expect(brandPresets.vitrinealu).toBeDefined();
    expect(brandPresets.vitrinealu.name).toBe('VitrineAlu');
    expect(brandPresets.vitrinealu.prompts.garden).toContain('garden');
    expect(brandPresets.vitrinealu.prompts.studio).toContain('studio');
    expect(brandPresets.vitrinealu.settings.engine).toBe('SDXL');
  });

  it('should have all required prompt types', () => {
    const preset = brandPresets.vitrinealu;
    expect(preset.prompts).toHaveProperty('garden');
    expect(preset.prompts).toHaveProperty('studio');
    expect(preset.prompts).toHaveProperty('minimal');
    expect(preset.prompts).toHaveProperty('lifestyle');
  });

  it('should have reasonable default settings', () => {
    const preset = brandPresets.vitrinealu;
    expect(preset.settings.steps).toBeGreaterThan(0);
    expect(preset.settings.steps).toBeLessThanOrEqual(100);
    expect(preset.settings.guidanceScale).toBeGreaterThanOrEqual(1);
    expect(preset.settings.guidanceScale).toBeLessThanOrEqual(20);
  });
});

describe('Client Factory Functions', () => {
  it('should create client with custom config', () => {
    const customConfig = {
      baseUrl: 'http://custom:9000',
      timeout: 60000
    };

    const client = createClient(customConfig);
    expect(client).toBeInstanceOf(BackgroundClient);
  });

  it('should create client from environment', () => {
    // Mock environment variables
    process.env.BACKGROUND_API_URL = 'http://env-test:8089';
    
    const client = createClient();
    expect(client).toBeInstanceOf(BackgroundClient);

    // Clean up
    delete process.env.BACKGROUND_API_URL;
  });
});