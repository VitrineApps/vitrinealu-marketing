import { Platform, CaptionJSON } from '../types.js';

export interface CaptionProvider {
  generate(options: {
    platform: Platform;
    brief: string;
    productTags: string[];
    location?: string;
    features?: string[];
    brandTone?: string[];
    exif?: {
      lens: 'ultra-wide' | 'wide' | 'standard';
      timeOfDay: 'day' | 'golden_hour' | 'night';
    };
    seed?: number;
    model?: string;
  }): Promise<CaptionJSON>;
}