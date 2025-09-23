/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { AdapterFactory, createAdapterFactoryFromEnv } from '../src/adapterFactory';
import { FFmpegAdapter } from '../src/adapters/ffmpegAdapter';
import { CapCutAdapter } from '../src/adapters/capcutAdapter';
import { RunwayAdapter } from '../src/adapters/runwayAdapter';
import type { AdapterFactoryConfig, CapCutConfig, RunwayConfig } from '../src/adapters/types';

describe('Video Adapters', () => {

  describe('FFmpegAdapter', () => {
    it('should have correct name', () => {
      const adapter = new FFmpegAdapter();
      expect(adapter.name).toBe('ffmpeg');
    });

    it('should check availability', async () => {
      const adapter = new FFmpegAdapter();
      const isAvailable = await adapter.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('CapCutAdapter', () => {
    const mockConfig: CapCutConfig = {
      apiKey: 'test-api-key',
      templateId: 'test-template-id',
      baseUrl: 'https://api.test.com',
      maxPollAttempts: 3,
      pollIntervalMs: 100,
    };

    it('should have correct name', () => {
      const adapter = new CapCutAdapter(mockConfig);
      expect(adapter.name).toBe('capcut');
    });

    it('should check availability without API key', async () => {
      const configWithoutKey: CapCutConfig = {
        ...mockConfig,
        apiKey: '',
      };
      const adapter = new CapCutAdapter(configWithoutKey);
      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(false);
    });
  });

  describe('RunwayAdapter', () => {
    const mockConfig: RunwayConfig = {
      apiKey: 'test-runway-key',
      baseUrl: 'https://api.runway.test',
      model: 'gen-3a-turbo',
      maxPollAttempts: 3,
      pollIntervalMs: 100,
    };

    it('should have correct name', () => {
      const adapter = new RunwayAdapter(mockConfig);
      expect(adapter.name).toBe('runway');
    });

    it('should check availability without API key', async () => {
      const configWithoutKey: RunwayConfig = {
        ...mockConfig,
        apiKey: '',
      };
      const adapter = new RunwayAdapter(configWithoutKey);
      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(false);
    });
  });

  describe('AdapterFactory', () => {
    const mockConfig: AdapterFactoryConfig = {
      defaultAdapter: 'ffmpeg' as const,
      fallbackOrder: ['capcut', 'runway', 'ffmpeg'] as const,
      enableFallback: true,
      capcut: {
        apiKey: 'capcut-key',
        templateId: 'template-123',
        baseUrl: 'https://api.capcut.test',
        maxPollAttempts: 2,
        pollIntervalMs: 100,
      },
      runway: {
        apiKey: 'runway-key',
        baseUrl: 'https://api.runway.test',
        model: 'gen-3a-turbo',
        maxPollAttempts: 2,
        pollIntervalMs: 100,
      },
    };

    it('should initialize with correct config', () => {
      const factory = new AdapterFactory(mockConfig);
      expect(factory).toBeInstanceOf(AdapterFactory);
    });

    it('should get available adapters', async () => {
      const factory = new AdapterFactory(mockConfig);
      const available = await factory.getAvailableAdapters();
      expect(Array.isArray(available)).toBe(true);
    });

    it('should clear availability cache', () => {
      const factory = new AdapterFactory(mockConfig);
      expect(() => factory.clearAvailabilityCache()).not.toThrow();
    });
  });

  describe('createAdapterFactoryFromEnv', () => {
    it('should create factory from environment variables', () => {
      // Set environment variables
      process.env.VIDEO_ADAPTER = 'capcut';
      process.env.CAPCUT_API_KEY = 'test-key';
      process.env.CAPCUT_TEMPLATE_ID = 'test-template';
      process.env.RUNWAY_API_KEY = 'runway-key';

      const factory = createAdapterFactoryFromEnv();
      expect(factory).toBeInstanceOf(AdapterFactory);

      // Clean up
      delete process.env.VIDEO_ADAPTER;
      delete process.env.CAPCUT_API_KEY;
      delete process.env.CAPCUT_TEMPLATE_ID;
      delete process.env.RUNWAY_API_KEY;
    });

    it('should use default values when env vars are not set', () => {
      const factory = createAdapterFactoryFromEnv();
      expect(factory).toBeInstanceOf(AdapterFactory);
    });
  });
});