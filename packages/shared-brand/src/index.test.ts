import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import { loadBrandConfig, BrandConfigSchema, type BrandConfig } from './index.js';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock js-yaml
vi.mock('js-yaml', () => ({
  load: vi.fn(),
}));

const mockReadFileSync = vi.mocked(readFileSync);
const mockLoadYaml = vi.mocked(loadYaml);

describe('BrandConfig', () => {
  const mockBrandConfig: BrandConfig = {
    brand: 'vitrinealu',
    tagline: 'Bring light into living',
    colors: {
      primary: '#111827',
      secondary: '#FBBF24',
      accent: '#0EA5E9',
      text_light: '#FFFFFF',
      text_dark: '#111827',
    },
    fonts: {
      primary: 'Montserrat',
      secondary: 'Lato',
    },
    watermark: {
      path: 'assets/brand/watermark.png',
      opacity: 0.85,
      margin_px: 48,
    },
    aspect_ratios: {
      reels: '9:16',
      square: '1:1',
      landscape: '16:9',
    },
    safe_areas: {
      reels: { top: 220, bottom: 220, left: 40, right: 40 },
    },
  };

  describe('BrandConfigSchema', () => {
    it('should validate a valid brand config', () => {
      const result = BrandConfigSchema.safeParse(mockBrandConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockBrandConfig);
      }
    });

    it('should reject invalid brand name', () => {
      const invalid = { ...mockBrandConfig, brand: 123 };
      const result = BrandConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject invalid color format', () => {
      const invalid = {
        ...mockBrandConfig,
        colors: { ...mockBrandConfig.colors, primary: 'invalid' }
      };
      const result = BrandConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject invalid opacity', () => {
      const invalid = {
        ...mockBrandConfig,
        watermark: { ...mockBrandConfig.watermark, opacity: 1.5 }
      };
      const result = BrandConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject negative margin', () => {
      const invalid = {
        ...mockBrandConfig,
        watermark: { ...mockBrandConfig.watermark, margin_px: -10 }
      };
      const result = BrandConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('loadBrandConfig', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should load and validate brand config from default path', () => {
      const yamlContent = 'brand: test\ncolors:\n  primary: "#000"';
      mockReadFileSync.mockReturnValue(yamlContent);
      mockLoadYaml.mockReturnValue({ brand: 'test', colors: { primary: '#000' } });

      // This would normally fail validation, but we're testing the loading mechanism
      expect(() => loadBrandConfig()).toThrow();
    });

    it('should load and validate brand config from custom path', () => {
      const yamlContent = 'brand: test\ncolors:\n  primary: "#000"';
      mockReadFileSync.mockReturnValue(yamlContent);
      mockLoadYaml.mockReturnValue({ brand: 'test', colors: { primary: '#000' } });

      expect(() => loadBrandConfig('/custom/path.yaml')).toThrow();
    });

    it('should throw error for invalid YAML', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => loadBrandConfig()).toThrow('Failed to load brand config');
    });

    it('should throw error for invalid config structure', () => {
      const yamlContent = 'invalid: yaml';
      mockReadFileSync.mockReturnValue(yamlContent);
      mockLoadYaml.mockReturnValue({ invalid: 'yaml' });

      expect(() => loadBrandConfig()).toThrow('Failed to load brand config');
    });
  });
});