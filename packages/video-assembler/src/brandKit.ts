import { promises as fs } from 'fs';
import * as yaml from 'yaml';
import { BrandKit, BrandKitSchema } from './types';
import { logger } from './logger';

// Import shared brand config
import { loadBrandConfig } from '@vitrinealu/shared-brand';

export class BrandKitLoader {
  /**
   * Load brand kit from shared brand config
   */
  static async loadFromSharedConfig(): Promise<BrandKit> {
    try {
      const brandConfig = loadBrandConfig();

      // Convert shared brand config to video-assembler BrandKit format
      const brandKit: BrandKit = {
        brand: brandConfig.brand,
        colors: {
          primary: brandConfig.colors.primary,
          secondary: brandConfig.colors.secondary,
          accent: brandConfig.colors.accent,
        },
        fonts: {
          primary: brandConfig.fonts.primary,
          secondary: brandConfig.fonts.secondary,
          heading: brandConfig.fonts.primary, // Use primary as heading fallback
        },
        watermark: {
          path: brandConfig.watermark.path,
          opacity: brandConfig.watermark.opacity,
          scale: 0.15, // Default scale for video assembler
          position: 'bottom-right', // Default position
        },
      };

      // Validate with existing schema
      const validated = BrandKitSchema.parse(brandKit);

      logger.info(`Loaded brand kit from shared config: ${validated.brand}`);
      return validated;
    } catch (error) {
      logger.error({ msg: 'Failed to load brand kit from shared config', error });
      throw new Error('Invalid shared brand configuration');
    }
  }

  /**
   * Load brand kit from YAML file (legacy support)
   */
  static async loadFromFile(filePath: string): Promise<BrandKit> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = yaml.parse(content);

      // Validate with Zod schema
      const validated = BrandKitSchema.parse(data);

      logger.info(`Loaded brand kit: ${validated.brand}`);
      return validated;
    } catch (error) {
      if (error instanceof Error) {
      logger.error({ msg: `Failed to load brand kit from ${filePath}`, error: error.message });
      }
      throw new Error(`Invalid brand kit configuration: ${filePath}`);
    }
  }

  /**
   * Find system fonts that match brand kit fonts
   */
  static async resolveFontPaths(brandKit: BrandKit): Promise<BrandKit> {
    const resolved = { ...brandKit };

    // This is a simplified font resolution
    // In a real implementation, you'd use system font APIs
    const systemFonts = await this.getSystemFonts();

    resolved.fonts = {
      primary: this.findMatchingFont(brandKit.fonts.primary, systemFonts) || brandKit.fonts.primary,
      secondary: brandKit.fonts.secondary ?
        this.findMatchingFont(brandKit.fonts.secondary, systemFonts) || brandKit.fonts.secondary :
        resolved.fonts.primary,
      heading: brandKit.fonts.heading ?
        this.findMatchingFont(brandKit.fonts.heading, systemFonts) || brandKit.fonts.heading :
        resolved.fonts.primary,
    };

    return resolved;
  }

  /**
   * Get list of available system fonts
   * This is a simplified implementation - real implementation would use fontconfig or similar
   */
  private static async getSystemFonts(): Promise<string[]> {
    // Common system fonts
    return [
      'Arial',
      'Helvetica',
      'Times New Roman',
      'Courier New',
      'Verdana',
      'Georgia',
      'Comic Sans MS',
      'Impact',
      'Tahoma',
      'Trebuchet MS',
    ];
  }

  /**
   * Find a matching font from available fonts
   */
  private static findMatchingFont(requestedFont: string, availableFonts: string[]): string | null {
    // Exact match
    if (availableFonts.includes(requestedFont)) {
      return requestedFont;
    }

    // Case-insensitive match
    const lowerRequested = requestedFont.toLowerCase();
    const match = availableFonts.find(font => font.toLowerCase() === lowerRequested);
    if (match) {
      return match;
    }

    // Partial match
    const partialMatch = availableFonts.find(font =>
      font.toLowerCase().includes(lowerRequested) ||
      lowerRequested.includes(font.toLowerCase())
    );

    return partialMatch || null;
  }

  /**
   * Validate watermark file exists
   */
  static async validateWatermark(brandKit: BrandKit): Promise<boolean> {
    if (!brandKit.watermark?.path) {
      return true; // No watermark is valid
    }

    try {
      await fs.access(brandKit.watermark.path);
      return true;
    } catch {
      logger.warn(`Watermark file not found: ${brandKit.watermark.path}`);
      return false;
    }
  }

  /**
   * Create default brand kit
   */
  static createDefault(): BrandKit {
    return {
      brand: 'default',
      colors: {
        primary: '#000000',
        secondary: '#666666',
      },
      fonts: {
        primary: 'Arial',
        secondary: 'Helvetica',
      },
      watermark: {
        path: '',
        opacity: 0.8,
        scale: 0.15,
        position: 'bottom-right',
      },
    };
  }

  /**
   * Merge brand kit with defaults
   */
  static mergeWithDefaults(partial: Partial<BrandKit>): BrandKit {
    const defaults = this.createDefault();

    return {
      brand: partial.brand || defaults.brand,
      colors: {
        primary: partial.colors?.primary || defaults.colors.primary,
        secondary: partial.colors?.secondary || defaults.colors.secondary,
        accent: partial.colors?.accent,
      },
      fonts: {
        primary: partial.fonts?.primary || defaults.fonts.primary,
        secondary: partial.fonts?.secondary || defaults.fonts.secondary,
        heading: partial.fonts?.heading || defaults.fonts.heading,
      },
      watermark: partial.watermark ? {
        ...defaults.watermark,
        ...partial.watermark,
      } : defaults.watermark,
    };
  }

  /**
   * Load brand kit with fallbacks (shared config first, then file paths)
   */
  static async loadWithFallbacks(filePaths: string[] = []): Promise<BrandKit> {
    // Try shared config first
    try {
      return await this.loadFromSharedConfig();
    } catch (error) {
      logger.debug({ msg: 'Failed to load from shared config, trying file paths', error });
    }

    // Fall back to file paths
    for (const filePath of filePaths) {
      try {
        const brandKit = await this.loadFromFile(filePath);
        const validated = await this.validateWatermark(brandKit);
        if (!validated) {
          logger.warn(`Watermark validation failed for ${filePath}, continuing...`);
        }
        return await this.resolveFontPaths(brandKit);
      } catch (error) {
        logger.debug({ msg: `Failed to load brand kit from ${filePath}`, error });
        continue;
      }
    }

    logger.warn('No valid brand kit found, using defaults');
    return this.createDefault();
  }
}