import path from 'path';
import { promises as fs } from 'fs';

export interface WatermarkOptions {
  path: string;
  scale?: number;
  opacity?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  margin?: number;
}

export class Watermark {
  /**
   * Generate FFmpeg filter for watermark overlay
   */
  static generateWatermarkFilter(
    watermarkPath: string,
    videoWidth: number,
    videoHeight: number,
    options: Partial<WatermarkOptions> = {}
  ): string {
    const scale = options.scale || 0.15; // 15% of video size
    const opacity = options.opacity || 0.8;
    const position = options.position || 'bottom-right';
    const margin = options.margin || 20;

    // Calculate watermark size based on video dimensions
    const watermarkSize = videoWidth * scale;

    // Position coordinates
    let x: string, y: string;
    switch (position) {
      case 'top-left':
        x = margin.toString();
        y = margin.toString();
        break;
      case 'top-right':
        x = `W-w-${margin}`;
        y = margin.toString();
        break;
      case 'bottom-left':
        x = margin.toString();
        y = `H-h-${margin}`;
        break;
      case 'center':
        x = `(W-w)/2`;
        y = `(H-h)/2`;
        break;
      case 'bottom-right':
      default:
        x = `W-w-${margin}`;
        y = `H-h-${margin}`;
        break;
    }

    // Build filter chain
    const filter = `movie=${watermarkPath},` +
      `scale=${watermarkSize}:-1,` + // Scale maintaining aspect ratio
      `format=rgba,` + // Ensure alpha channel
      `colorchannelmixer=aa=${opacity},` + // Apply opacity
      `[wm];` + // Label the watermark stream
      `[in][wm]overlay=${x}:${y}`; // Overlay on main video

    return filter;
  }

  /**
   * Validate watermark file exists and is supported format
   */
  static async validateWatermarkFile(watermarkPath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      await fs.access(watermarkPath);

      const ext = path.extname(watermarkPath).toLowerCase();
      const supportedFormats = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];

      if (!supportedFormats.includes(ext)) {
        return {
          valid: false,
          error: `Unsupported watermark format: ${ext}. Supported: ${supportedFormats.join(', ')}`
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Watermark file not found: ${watermarkPath}`
      };
    }
  }

  /**
   * Calculate optimal watermark size for video dimensions
   */
  static calculateOptimalSize(
    videoWidth: number,
    videoHeight: number,
    maxPercent: number = 0.05
  ): { width: number; height: number } {
    const maxSize = Math.floor(videoWidth * maxPercent);

    // Assume square watermark for calculation
    return {
      width: maxSize,
      height: maxSize,
    };
  }

  /**
   * Generate watermark filter with automatic sizing
   */
  static async generateAutoSizedFilter(
    watermarkPath: string,
    videoWidth: number,
    videoHeight: number,
    options: Partial<WatermarkOptions> = {}
  ): Promise<string> {
    // Validate file first
    const validation = await this.validateWatermarkFile(watermarkPath);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Use provided scale or calculate optimal
    const scale = options.scale || 0.15;

    return this.generateWatermarkFilter(
      watermarkPath,
      videoWidth,
      videoHeight,
      { ...options, scale }
    );
  }

  /**
   * Create multiple watermark filters for complex overlays
   */
  static generateMultiWatermarkFilters(
    watermarks: WatermarkOptions[],
    videoWidth: number,
    videoHeight: number
  ): string {
    if (watermarks.length === 0) {
      return '';
    }

    if (watermarks.length === 1) {
      return this.generateWatermarkFilter(
        watermarks[0].path,
        videoWidth,
        videoHeight,
        watermarks[0]
      );
    }

    // For multiple watermarks, chain them together
    const filters: string[] = [];
    let inputLabel = '[in]';

    watermarks.forEach((wm, index) => {
      const filter = this.generateWatermarkFilter(
        wm.path,
        videoWidth,
        videoHeight,
        wm
      );

      // Replace [in] with previous output label
      const modifiedFilter = filter.replace('[in]', inputLabel);

      // Update output label for next iteration
      const outputLabel = index === watermarks.length - 1 ? '' : `[out${index}]`;
      const finalFilter = modifiedFilter.replace('[in][wm]overlay', `[wm]overlay${outputLabel}`);

      filters.push(finalFilter);
      inputLabel = outputLabel;
    });

    return filters.join(';');
  }
}