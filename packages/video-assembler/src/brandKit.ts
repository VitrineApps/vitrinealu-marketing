import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { dirname, resolve, isAbsolute } from 'path';
import { BrandKit, BrandKitSchema } from './types';
import pino from 'pino';

const logger = pino({ name: 'brand' });

/**
 * Load brand kit from YAML file
 */
export async function loadBrandKit(brandPath: string): Promise<BrandKit> {
  try {
    const yamlContent = readFileSync(brandPath, 'utf8');
    const rawData = parse(yamlContent);
    
    // Validate with Zod schema
    const brandKit = BrandKitSchema.parse(rawData);
    
    logger.debug({ brand: brandKit.brand }, 'Brand kit loaded successfully');
    return brandKit;
  } catch (error) {
    logger.error({ error, brandPath }, 'Failed to load brand kit');
    throw new Error(`Failed to load brand kit from ${brandPath}: ${error}`);
  }
}

/**
 * Validate brand kit structure
 */
export function validateBrandKit(brandKit: unknown): BrandKit {
  try {
    return BrandKitSchema.parse(brandKit);
  } catch (error) {
    logger.error({ error }, 'Brand kit validation failed');
    throw new Error(`Invalid brand kit structure: ${error}`);
  }
}

/**
 * Get default brand kit for fallback
 */
export function getDefaultBrandKit(): BrandKit {
  return {
    brand: 'default',
    colors: {
      primary: '#111827',
      secondary: '#FBBF24',
      accent: '#0EA5E9',
      text_light: '#FFFFFF',
      text_dark: '#111827',
    },
    fonts: {
      primary: 'Arial',
      secondary: 'Helvetica',
    },
    watermark: {
      path: 'assets/brand/watermark.png',
      opacity: 0.8,
      margin_px: 48,
    },
    safe_areas: {
      reels: { top: 220, bottom: 220, left: 40, right: 40 },
      square: { top: 100, bottom: 100, left: 40, right: 40 },
      landscape: { top: 100, bottom: 100, left: 60, right: 60 },
    },
  };
}

/**
 * Resolve watermark path relative to brand file
 */
export function resolveWatermarkPath(brandKit: BrandKit, brandPath: string): string | undefined {
  if (!brandKit.watermark?.path) {
    return undefined;
  }
  
  const brandDir = dirname(brandPath);
  
  // If path is absolute, use as-is, otherwise resolve relative to brand file
  if (isAbsolute(brandKit.watermark.path)) {
    return brandKit.watermark.path;
  }
  
  return resolve(brandDir, brandKit.watermark.path);
}