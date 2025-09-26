import { CaptionProvider } from './base.js';
import { Platform, CaptionJSON } from '../types.js';
export declare class OpenAIProvider implements CaptionProvider {
    private client;
    constructor(apiKey?: string);
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
    private buildUserContent;
    private supportsSeed;
}
//# sourceMappingURL=openaiProvider.d.ts.map